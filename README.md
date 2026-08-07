# World Shooting League

Online-Liga für Sportschützen auf elektronischen Ständen. Zwei Schützen treten
zeit- und ortsunabhängig gegeneinander an: jeder schießt in seinem Verein, lädt
das Ergebnis hoch, und erst wenn beide abgegeben haben, werden die Ergebnisse
gegenseitig sichtbar.

Dieses Repository enthält aktuell das **Datenmodell** — Postgres-Schema für
Supabase, inklusive Zustandsautomat, Row Level Security und Glicko-2-Rating.

## Formate

Kurze Formate, bewusst:

| Format | Ablauf |
|---|---|
| `single_10` | Eine Serie über 10 Schuss, eine Woche Zeit. |
| `best_of_five` | Fünf Serien à 10 Schuss, wer zuerst 3 Punkte hat, gewinnt. Alle fünf Bouts sind gleichzeitig offen. |

Disziplinen im Seed: `AR10ET` (LG 10 m stehend), `AP10ET` (LP 10 m),
`SBR10ET` (KK 50 m liegend), `SBP10ET` (Sportpistole 25 m).

## Aufbau

```
supabase/
  migrations/   Schema in Anwendungsreihenfolge
  seed.sql      Disziplinen und Formate
  tests/        SQL-Tests gegen ein Wegwerf-Cluster
scripts/
  test-local.sh Migrationen anwenden und Tests fahren
docs/
  data-model.md Entitäten, Zustandsautomat, Designentscheidungen
```

Migrationen:

| Datei | Inhalt |
|---|---|
| `..._init_types.sql` | Enums und gemeinsame Helfer |
| `..._profiles.sql` | Schützenprofile, Signup-Trigger |
| `..._catalog.sql` | Disziplinen und Formate |
| `..._seasons.sql` | Saisons, Teilnehmer, Runden |
| `..._matches.sql` | Matches und Bouts |
| `..._submissions.sql` | Uploads, Validierung, Blind Reveal |
| `..._disputes.sql` | Schiedsrichterfälle |
| `..._ratings.sql` | Glicko-2 |
| `..._settlement.sql` | Auswertung, Deadlines, Finalisierung |
| `..._rls.sql` | Row Level Security und öffentliche Sichten |
| `..._storage.sql` | Buckets für Scheibenfotos und Avatare |
| `..._pairing.sql` | Rundenpaarung |
| `..._scheduling.sql` | `run_league_tick()` und der Cron-Job |

## Lokal testen

Braucht nur `postgresql-16`, kein Docker und keine Supabase-CLI:

```bash
./scripts/test-local.sh
```

Das Skript baut ein Wegwerf-Cluster, wendet Stub, Migrationen und Seed an und
fährt die Tests in `supabase/tests/`. Der Stub ersetzt, was Supabase sonst
mitbringt: `auth.users`, `auth.uid()`, das `storage`-Schema und die Rollen
`anon` / `authenticated`.

Getestet werden:

* **`10_match_lifecycle.sql`** — Paarung, Blind Reveal, Best-of-Five endet nach
  drei gewonnenen Bouts, Einspruchsfenster blockiert die Wertung, Glicko-2
  greift danach, `finalize_match()` ist idempotent.
* **`20_blind_reveal_rls.sql`** — der Gegner sieht vor eigener Abgabe **nichts**;
  Doppelabgabe, Abgabe für Dritte, Überschreiben und Löschen scheitern; ein
  Unbeteiligter sieht das Ergebnis, aber keine Submission.
* **`30_deadlines_and_validation.sql`** — Forfeit bei verpasster Deadline,
  Stechkampf-Bout bei Gleichstand, Verwerfen toter Matches, Ablehnung falscher
  Schusszahl, überhöhter Werte, Zehntel bei Pistole und rückdatierter Serien.

## Auf ein Supabase-Projekt anwenden

```bash
supabase link --project-ref <ref>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

`pg_cron` vorher unter *Database → Extensions* aktivieren, sonst schlägt die
Scheduling-Migration fehl.

## Nächste Schritte

1. Edge Function für die OCR der Meyton-/DISAG-Streifen, die
   `submissions.shots` befüllt (`source = 'photo_ocr'`).
2. Expo-Client: Ladder, Upload, Match-Detail, Push bei „Gegner hat abgegeben".
3. Referee-Ansicht für die Fallliste.
