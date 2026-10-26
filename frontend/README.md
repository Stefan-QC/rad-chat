# RAD Chat frontend

React 19 + Vite + TypeScript. Praat met Supabase (data, inloggen, realtime) en met de Node-host (`/api/*`).

```sh
npm run dev      # live herladen op http://localhost:5173 (vanuit de hoofdmap)
npm run build    # typecontrole + productiebuild naar frontend/dist
npm test         # unit-tests (vitest)
```

De instellingen komen uit het `.env`-bestand in de hoofdmap (`VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY`).
In productie levert de Node-host ze op `/config.js`, dus dezelfde build werkt met elk Supabase-project.

```
src/
  core/        types, fouten, Supabase-hulpjes, markdown, opmaak
  services/    één klasse per domein (Auth, Message, Team, Voice, ...)
  app/         React-contexten
  components/  shell, chat, beheer, mensen, taken, ui-bouwstenen
  pages/       één component per route (laden pas als je ze opent)
  hooks/       herbruikbare React-hooks
  features/    Wordle en RAD Craft
  styles/      huisstijl-tokens (licht en donker) en stylesheets
public/        statische bestanden (icoon, thema-script, config.js)
```
