# Data model

The Postgres schema behind the World Shooting League on Supabase. Short formats:
**10 shots** as the unit, **best of five** as the league format.

## Terms

| Term | Meaning |
|---|---|
| **Bout** | One series of 10 shots. The smallest scorable unit. |
| **Match** | A duel between two shooters. `single_10` has one bout, `best_of_five` up to five. |
| **Round** | One round of the season ladder. Produces a match for every entrant. |
| **Season** | A ladder over one discipline and one format, with a fixed number of rounds. |
| **Submission** | What a shooter reports for a bout: total, photo, time of shooting, and inner tens where the discipline needs them. |

## Entities

```mermaid
erDiagram
    profiles ||--o{ season_entries : "enters"
    profiles ||--o{ submissions : "reports"
    profiles ||--o{ ratings : "holds"

    disciplines ||--o{ seasons : ""
    formats     ||--o{ seasons : ""
    seasons     ||--o{ rounds : ""
    seasons     ||--o{ season_entries : ""

    rounds  ||--o{ matches : "pairs"
    matches ||--o{ bouts : "consists of"
    bouts   ||--o{ submissions : "collects"
    bouts   ||--o{ disputes : "can raise"

    matches ||--o{ rating_events : "produces"
    submissions ||--o{ bout_confirmations : "is confirmed by"
```

`matches.round_id` and `season_id` are nullable: a match without a round is a
free-form challenge. It is rated but does not count towards a season table.

## State machine

The whole flow hangs off two columns: `bouts.state` and `matches.state`.

```mermaid
stateDiagram-v2
    [*] --> pending : match created
    pending --> open : match goes live
    open --> awaiting_opponent : first submission
    awaiting_opponent --> revealed : second submission
    revealed --> settled : advance_match()
    revealed --> disputed : dispute raised
    disputed --> revealed : resolve_dispute()
    open --> forfeited : deadline, nobody shot
    awaiting_opponent --> forfeited : deadline, one side missing
    settled --> [*]
    open --> void : match already decided
```

The **blind reveal** is the transition `awaiting_opponent → revealed`. Only
there may the opponent read the other submission — enforced by RLS, not by the
client. While a bout sits in `awaiting_opponent` the second shooter can see
*that* the other has submitted, but not *what*.

Match:

```
scheduled -> live -> settled -> finalized
                  \-> awaiting_review (dispute open)
                  \-> void (nobody shot)
```

`settled` means the winner is known and the dispute window is running.
`finalized` means the window has closed, no case is open, and **Glicko-2 has
been applied**. Ratings never move on a result that is still contested.

## Best of five: parallel, not sequential

`formats.progression = 'parallel'` opens all five bouts at once. A shooter fires
the whole match in one range session and reports five series.

Sequential would be truer to the format but would mean five waiting cycles per
match — with play independent of time and place, the reliable way to a dead
league. The column exists and `'sequential'` is implemented; the default is
deliberately `'parallel'`.

`advance_match()` always settles bouts **in index order**, so a parallel match
decides the same way regardless of which upload arrived first. Once a side
reaches `points_to_win` (3.0) the remaining bouts are set to `void`.

A match level on points is resolved in this order: aggregate score → inner tens
→ an extra shoot-off bout over 48 hours.

## Reporting: a total, a photo, and sometimes inner tens

The shooter reads the total off the range display or the printout and types it
in. The photo is mandatory — it is the evidence the opponent checks after the
reveal.

There is deliberately **no OCR**. Typing one number is not worth automating, and
the opponent verifies it anyway: motivated, and more reliable than a model
reading a photo of a monitor. Ranges that can export (SIUS CSV, later a
manufacturer API) may additionally supply the individual shots
(`source = 'file_export'`), whose sum then cross-checks the total.

### Why inner tens, and only sometimes

`disciplines.requires_inner_tens` asks for a second number where the discipline
is scored in whole rings, and for nothing extra where it is scored in tenths.

ISSF breaks a tied full-ring score on inner tens, so full-ring disciplines need
the count. Decimal scores mostly break their own ties: simulating 200,000
pairings of club-level shooters puts the tie rate for a 10-shot pistol series
around **11%** against roughly **2%** for decimal rifle. At 11%, a best-of-five
without a tiebreak would send a third of all matches into an extra round — the
exact delay that kills an asynchronous league. At 2% it is not worth a second
field at the moment of submission.

An inner ten is a position on the target, not a ring value, which has two
consequences worth knowing:

* It **cannot be derived from a shot array.** A file export supplying decimal
  values cross-checks the total but says nothing about inner tens.
* It gives only a **floor**, not a window. Every inner ten is worth at least 10,
  so `total >= inner_tens * 10`. There is no useful ceiling, because a shot that
  is not an inner ten can still score a full ten.

So the arithmetic cross-check is weak, and it is not the reason the field
exists. Typos are caught by `shooter_recent_form()` in the client, which warns
when a report sits more than 5 rings above the shooter's own average.

## What carries the trust model

1. **The blind reveal is the strongest lever.** Someone who does not know what
   they have to beat cannot keep shooting until it is enough.
2. **Submissions are immutable.** There is no update and no delete policy for
   shooters. A correction goes through a referee via `adjusted_total`, which
   leaves the original in place.
3. **Peer confirmation replaces automated scoring.** Each shooter checks the
   opponent's photo against the reported figures. Letting the window lapse does
   not block the ladder — the confirmation is set automatically and counts
   against the shooter's rate in `shooter_reliability`.
4. **`shot_at` must fall inside the bout window** (one hour of slack for clock
   drift on range printers). The cheapest replay check against reporting an old
   series.
5. **Plausibility per discipline.** Total within reach, inner tens not more than
   the shot count, whole rings only where the discipline scores that way.
6. **Photos are evidence.** The storage bucket allows insert and select, no
   update, no delete — and mirrors the reveal rule exactly. `capture_method`
   records whether the photo was taken in-app or picked from the library.
7. **Ratings only after the dispute window.** `finalize_match()` refuses while
   `dispute_closes_at` is in the future or a case is open.

## Rating: Glicko-2

One row in `ratings` per `(shooter, discipline)` with rating, RD and volatility.
Start: 1500 / 350 / 0.06, τ = 0.5.

Elo would work too, but a shooter plays maybe eight rated matches a season.
Glicko-2 tracks rating deviation and therefore knows how little it knows about a
newcomer. `leaderboard.is_provisional` marks everything above RD 110 — newcomers
do not belong unfiltered next to established shooters.

`glicko2_decay()` inflates RD again for periods sat out, so an inactive leader
does not keep a tight deviation forever.

The SQL implementation is checked against an independent reference
implementation (Illinois variant of regula falsi for the volatility, as in the
[Glickman paper](http://www.glicko.net/glicko/glicko2.pdf), step 5).

## Pairing

`pair_round()` is Swiss-style: sort the active field by rating, pair neighbours,
skip a pairing that already happened this season and take the next candidate.
With an odd field the last one gets a bye.

That keeps matches close, and close matches get finished.

## Public views

`match_results`, `leaderboard` and `shooter_reliability` run with
`security_invoker = false`, so they can expose settled scores without exposing
the submission rows themselves. Spectators see points and rankings, but no
photos and no matches in progress.

## Maintenance

`run_league_tick()` is the single entry point for everything time-driven: open
and pair rounds, forfeit expired bouts, void dead matches, auto-accept lapsed
confirmations, finalize due matches. It runs every 10 minutes via `pg_cron` and
returns a summary as JSON.

## Not included yet

Deliberately left out of the MVP: a social feed, awards, premium tiers, team
events, OCR and the manufacturer integration. `submissions.source` already knows
`'file_export'` and `'device_api'` as values — nothing more is needed for that
today.
