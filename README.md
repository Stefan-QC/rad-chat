# RAD Chat

De chat voor collega's: kanalen, DM's, GIF's, teams, spraak, taken, kennisbank, Wordle en meer.

## Starten

```sh
npm run setup    # alleen de eerste keer
npm start
```

Dat is alles. Op Windows kun je ook dubbelklikken op `scripts/start.cmd`.

Na `npm start` zie je in het scherm een adres, bijvoorbeeld `https://192.168.1.20:3000`.
Open dat adres, of geef het aan collega's in hetzelfde netwerk. Je krijgt één keer een certificaatwaarschuwing: accepteer die.

## De eerste keer: 3 dingen

1. **Node.js** (18 of nieuwer) en **Python** (3.11 of nieuwer) installeren.
2. **`.env` invullen**: `npm run setup` maakt het bestand aan. Zet er de Supabase-gegevens in
   (Supabase → Project Settings → API Keys): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` en `SUPABASE_SERVICE_ROLE_KEY`.
   GIF's nodig? Maak een gratis sleutel op [partner.klipy.com](https://partner.klipy.com) (API Keys → Add Platform) en zet die in `KLIPY_API_KEY`.
   Een testsleutel mag 100 verzoeken per uur doen; vraag daarna productietoegang aan in het Klipy-paneel.
3. **Database**: voer de bestanden in `supabase/migrations/` in volgorde uit (001 t/m 016) in de SQL-editor van Supabase.
   Maak daarna accounts onder Authentication → Users (eerste account = admin) en zet "Allow new users to sign up" uit.

## Games en punten

Onder **Games** (zijbalk, "All games") staan drie games met elk een eigen pagina: **TypeRace**, **Tetris** en **DOOM**.
Elke game toont je highscore. Daaronder staan de klassementen (top 10 per game en een algemeen klassement) en je eigen statistieken.

**Punten** (de database rekent de score altijd zelf uit, de browser meldt alleen wat er gebeurde):

| Game | Punten |
| --- | --- |
| TypeRace | WPM × accuracy × voortgang × 10, plus 500 / 250 / 100 voor plaats 1 / 2 / 3 (alleen bij minstens twee spelers die typten) |
| Tetris | 1 lijn 100, 2 lijnen 300, 3 lijnen 500, Tetris (4) 800, keer het level; zacht vallen 1 per cel, hard droppen 2 per cel |
| DOOM | gewone vijand 100, sterke 250, boss 1000, level voltooid 500, 10 per resterend HP bij het voltooien, alle vijanden van een level 500 |

**Algemeen klassement**: de games hebben andere puntenschalen, dus er worden geen ruwe punten opgeteld. Per game krijgt de beste speler 100 rangpunten,
de volgende iets minder (100 × (spelers − rang + 1) / spelers). Het totaal telt die rangpunten bij elkaar op.

**Eerlijk spelen**: een Tetris- of DOOM-run opent eerst een sessie bij de server en kan precies één keer worden ingeleverd. Je stuurt alleen de gebeurtenissen
(welke lijnen, welke vijanden), de server berekent de score en weigert onmogelijke meldingen (te veel blokken voor de tijd, meer vijanden dan er zijn, enzovoort).
TypeRace-punten worden door de server uitgedeeld zodra een ronde klaar is. Een score kan dus niet door de browser worden aangepast.

**Besturing**: Tetris met pijltjes (verplaatsen, zacht vallen), ↑ of X rechtsom draaien, Z linksom, spatie hard drop, C hold en P of Esc pauze.
DOOM met WASD, muis (pointer lock), linkermuisknop schieten, Shift sprinten, R herladen, spatie voor de uitgangsschakelaar en Esc pauze.
Alle graphics, geluiden en levels van DOOM zijn zelf gemaakt; er is niets van de originele game gebruikt.

## Accounts beheren: alleen in Supabase

Accounts aanmaken, wijzigen, deactiveren en verwijderen kan **alleen in het Supabase-dashboard**, ook niet als admin in de app.
In de app kan iedereen alleen zijn eigen wachtwoord en profiel wijzigen (Instellingen → My account). De Admin-pagina toont de ledenlijst alleen-lezen.

| Wat | Hoe in Supabase |
| --- | --- |
| Aanmaken | Authentication → Users → Add user (vink "Auto Confirm User" aan) |
| Verwijderen | Authentication → Users → ⋯ → Delete user. Let op: dat verwijdert ook hun berichten en gegevens |
| Rol (member, admin, guest) of einddatum gast | Table Editor → `profiles`, kolom `role` en `expires_at` |
| Deactiveren | Authentication → Users → ⋯ → Ban user, en zet `deactivated_at` in `profiles` op de huidige tijd (leeg = actief) |

Meer voorbeelden (SQL) staan in [supabase/README.md](supabase/README.md).

## Kunnen collega's er niet bij?

- Draai één keer `npm run setup -- --firewall` in een terminal als beheerder (Windows).
- Zet je netwerk op "Privé". Op sommige bedrijfs-wifi's kunnen apparaten elkaar niet bereiken.

## Altijd aan laten staan

Zolang jouw computer aan staat, werkt de chat. Wil je dat het altijd draait, zet het dan op een server:

- **Render**: zet de code op GitHub, kies "New → Blueprint" en wijs naar `render.yaml`. Vul de drie geheimen in. Klaar.
- **Andere server**: `docker build -f infra/Dockerfile -t rad-chat .` en start de image met de waarden uit `.env`, poort 3000.

Kies een abonnement dat niet in slaap valt, anders draaien de nachtelijke taken niet.

## Voor ontwikkelaars

| Wat | Commando |
| --- | --- |
| Live herladen tijdens het programmeren | `npm run dev` (draai ook `npm start` voor de API) |
| Opnieuw bouwen na een wijziging | `npm run build` |
| Alle tests (frontend en API) | `npm test` |
| Databasetests | `npm run test:db` |

Mappen:

```
rad-chat/
  frontend/    de React-app (zie frontend/README.md)
  backend/
    app/       de Python-API (FastAPI)
    tests/     tests van de API
    server/    de Node-host: serveert de app, beveiliging, start de API
    run_api.py, pyproject.toml, requirements*.txt
  infra/       Dockerfile en docker-compose
  scripts/     setup, certificaat, start.cmd
  supabase/    migraties en databasetests
  .github/     CI (tests bij elke push)
  .env         jouw instellingen (staat niet in git)
```
