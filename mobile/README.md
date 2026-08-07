# WSL Mobile

Expo-Client für die World Shooting League. iOS, Android und Web aus einer
Codebasis.

Der Client ist bewusst dünn: er rechnet nichts aus, entscheidet nichts und
wertet nichts. Er liest Sichten, schreibt eine Zeile, lädt ein Foto hoch. Die
gesamte Logik — Blind Reveal, Auswertung, Rating, Sichtbarkeit — liegt in
Postgres. Wer die App patcht, ändert nichts.

## Start

```bash
cp .env.example .env      # Supabase-URL und anon key eintragen
npm install
npm start
```

`npm run web` für den Browser, `npm run ios` / `npm run android` für die
Geräte. `npm run typecheck` prüft ohne Build.

## Bildschirme

```
app/
  (auth)/sign-in.tsx      Anmelden und Konto anlegen
  (tabs)/index.tsx        Meine Matches
  (tabs)/leaderboard.tsx  Rangliste je Disziplin
  (tabs)/profile.tsx      Profil, Ratings, Bestätigungsquote
  match/[id].tsx          Match mit allen Serien
  bout/[id]/report.tsx    Ergebnis melden: zwei Zahlen + Foto
  bout/[id]/confirm.tsx   Foto des Gegners prüfen
```

## Wie der Blind Reveal im Client aussieht

Gar nicht. Vor dem Reveal liefert die Datenbank die Zeile des Gegners nicht
aus — es gibt nichts zu verstecken und keine Bedingung, die der Client
auswerten müsste. `match/[id].tsx` rendert schlicht, was in `submissions`
steht: solange nur die eigene Meldung da ist, zeigt der Block des Gegners
`···`.

## Meldung

Zwei Felder und ein Foto. Vor dem Absenden prüft der Client dieselben Grenzen
wie `validate_submission()` in der Datenbank — Wertebereich, Zehnerzahl, und ob
Gesamtergebnis und Zehnerzahl überhaupt zueinander passen. Nicht als Sicherung,
sondern damit der Schütze es vor dem Upload erfährt statt danach.

Zusätzlich fragt er `shooter_recent_form()` ab und warnt, wenn die Meldung mehr
als 5 Ringe über dem eigenen Schnitt liegt. Das ist der billige Ersatz für eine
OCR beim einzigen realistischen Fehlerfall, dem Tippfehler.

Das Foto wird per Kamera aufgenommen (`capture_method = 'in_app_camera'`); die
Galerie bleibt möglich, wird aber als solche gespeichert.

## Bekannte Vereinfachungen

* `shot_at` wird auf den Zeitpunkt der Meldung gesetzt. Solange direkt nach dem
  Schießen gemeldet wird, stimmt das; ein eigenes Feld dafür fehlt noch.
* Keine Push-Benachrichtigungen. Bei rundenbasiertem Spiel sind sie der
  Retention-Motor und sollten als Nächstes kommen — dafür fehlen noch eine
  Tabelle für Gerätetokens und ein Trigger beim Reveal.
* Kein Beitritt zu einer Saison aus der App heraus; Teilnehmer werden bisher
  direkt in `season_entries` eingetragen.
* Keine Referee-Ansicht. Einsprüche lassen sich stellen, aber nicht bearbeiten.
