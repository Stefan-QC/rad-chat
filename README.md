# RAD Chat

De chat voor collega's: kanalen, DM's, GIF's, teams, spraak, taken, kennisbank, Wordle en meer.

## Starten

```sh
npm run setup    # alleen de eerste keer
npm start
```

Dat is alles. Op Windows kun je ook dubbelklikken op `start.cmd`.

Na `npm start` zie je in het scherm een adres, bijvoorbeeld `https://192.168.1.20:3000`.
Open dat adres, of geef het aan collega's in hetzelfde netwerk. Je krijgt één keer een certificaatwaarschuwing: accepteer die.

## De eerste keer: 3 dingen

1. **Node.js** (18 of nieuwer) en **Python** (3.11 of nieuwer) installeren.
2. **`.env` invullen**: `npm run setup` maakt het bestand aan. Zet er de Supabase-gegevens in
   (Supabase → Project Settings → API Keys): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` en `SUPABASE_SERVICE_ROLE_KEY`.
   GIF's nodig? Vul ook `GIPHY_API_KEY` in.
3. **Database**: voer de bestanden in `supabase/migrations/` in volgorde uit (001 t/m 013) in de SQL-editor van Supabase.
   Maak daarna accounts onder Authentication → Users (eerste account = admin) en zet "Allow new users to sign up" uit.

## Kunnen collega's er niet bij?

- Draai één keer `npm run setup -- --firewall` in een terminal als beheerder (Windows).
- Zet je netwerk op "Privé". Op sommige bedrijfs-wifi's kunnen apparaten elkaar niet bereiken.

## Altijd aan laten staan

Zolang jouw computer aan staat, werkt de chat. Wil je dat het altijd draait, zet het dan op een server:

- **Render**: zet de code op GitHub, kies "New → Blueprint" en wijs naar `render.yaml`. Vul de drie geheimen in. Klaar.
- **Andere server**: `docker build -t rad-chat .` en start de image met de waarden uit `.env`, poort 3000.

Kies een abonnement dat niet in slaap valt, anders draaien de nachtelijke taken niet.

## Voor ontwikkelaars

| Wat | Commando |
| --- | --- |
| Live herladen tijdens het programmeren | `npm run dev` (draai ook `npm start` voor de API) |
| Opnieuw bouwen na een wijziging | `npm run build` |
| Alle tests (frontend en API) | `npm test` |
| Databasetests | `npm run test:db` |

Mappen:

- `frontend/` de React-app
- `backend/server/` de Node-host (bestanden, beveiliging, start de API)
- `backend/api/` de Python-API (GIF's, beheer, geplande taken)
- `supabase/` de database (migraties en tests)
