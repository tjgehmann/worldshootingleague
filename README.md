# World Shooting League

Online-Liga für Sportschützen auf elektronischen Ständen. Zwei Schützen treten
zeit- und ortsunabhängig gegeneinander an: jeder schießt in seinem Verein,
meldet Gesamtergebnis und Anzahl Zehner mit einem Foto der Anzeige, und erst
wenn beide abgegeben haben, werden die Ergebnisse gegenseitig sichtbar.
Anschließend prüft jeder das Foto des Gegners.

Dieses Repository enthält:

* **`supabase/`** — das Datenmodell: Postgres-Schema mit Zustandsautomat, Row
  Level Security und Glicko-2-Rating.
* **`mobile/`** — den Expo-Client für iOS, Android und Web.

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
mobile/         Expo-Client (siehe mobile/README.md)
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
  Stechkampf-Bout bei Gleichstand, automatische Bestätigung nach abgelaufenem
  Fenster (und ihre Wirkung auf die Quote), Verwerfen toter Matches; Ablehnung
  überhöhter Ergebnisse, unmöglicher Zehner/Ergebnis-Kombinationen, Zehntel bei
  Pistole, abweichender Einzelschussdaten, rückdatierter Serien und fehlender
  Fotos.

## Auf ein Supabase-Projekt anwenden

1. **`pg_cron` aktivieren** — Dashboard → Database → Extensions. Ohne die
   Erweiterung schlägt die Scheduling-Migration fehl.
2. **Schema und Katalog einspielen:**
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
3. **Prüfen, dass alles gelandet ist:**
   ```bash
   psql "$DATABASE_URL" -f scripts/verify-deploy.sql
   ```
   Jede Zeile muss auf OK enden. Geprüft werden Tabellen, RLS auf jeder
   Tabelle, die drei Select-Policies des Blind Reveal, Insert-only auf
   `submissions`, Funktionen, Sichten, Trigger, die Storage-Buckets samt
   Policies, der Seed, der Cron-Job und die Glicko-2-Rechnung gegen die
   Referenzwerte.
4. **Schlüssel eintragen** — `mobile/.env` bekommt Projekt-URL und den
   Publishable Key (früher „anon key"), zu finden unter *Project Settings →
   API Keys*. Der ist öffentlich by design und gehört in den Client; der
   Secret- bzw. `service_role`-Key umgeht RLS und darf nie in die App.

Zum Testen ist es bequem, unter *Authentication → Sign In / Providers → Email*
die Bestätigungsmail abzuschalten — sonst kommt man nach der Registrierung
nicht direkt in die App.

## Eingabemodell

Zwei Zahlen und ein Foto — mehr nicht. Bewusst **keine OCR**: eine Zahl zu
tippen lohnt keine Automatisierung, und die Verifikation macht der Gegner nach
dem Reveal, motiviert und zuverlässiger als ein Modell auf einem Monitorfoto.
Wer exportieren kann (SIUS-CSV, später Hersteller-API), darf zusätzlich die
Einzelschüsse liefern; dann prüfen sich beide Wege gegenseitig.

Details und Begründung in [`docs/data-model.md`](docs/data-model.md).

## App starten

```bash
cd mobile
cp .env.example .env      # Supabase-URL und anon key eintragen
npm install
npm start
```

Details in [`mobile/README.md`](mobile/README.md).

## Nächste Schritte

1. Push-Benachrichtigungen: Tabelle für Gerätetokens, Trigger beim Reveal und
   vor Deadlines. Bei rundenbasiertem Spiel der Retention-Motor.
2. Saison-Beitritt aus der App statt per Hand in `season_entries`.
3. Referee-Ansicht für die Fallliste.
4. CSV-Import für SIUS-Exporte (`source = 'file_export'`).
