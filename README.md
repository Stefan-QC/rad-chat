# RAD Chat

Company chat for colleagues: channels, teams, voice, a daily Dutch Wordle, a shared block world and a leaderboard.
The frontend is React (Vite + TypeScript). All data lives in Supabase (Postgres, Auth, Realtime).
A tiny Node server hosts the built app, so it runs on a laptop, a VM, Docker or any static host.

## Quick start

```sh
npm install
cp .env.example .env.local      # fill in the Supabase URL and publishable key
npm run dev                     # http://localhost:5173
```

Production on Node (serves the same build to everyone on the network):

```sh
npm run build
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... npm start     # PORT=4000 to change the port
```

Colleagues open `http://<your-ip>:3000`. The URL and key are read at runtime from the environment
(`/config.js`), so the same build can point at another Supabase project.

## Set up Supabase (once)

1. Open the SQL editor of your project and run, in order:
   `supabase/migrations/001_core.sql` and `supabase/migrations/002_games_points_realtime.sql`.
2. Create accounts under **Authentication → Users → Add user**. Tick **Auto Confirm User**.
   The first account becomes an admin; admins can promote others on the Admin page.
3. Under **Authentication → Providers → Email**, switch off **Allow new users to sign up** so only accounts
   you create can sign in.

Everything the app does is stored in the database and protected with row level security:
profiles, teams, channels, messages (edit/delete), points, Wordle games, the RAD Craft world,
voice/game sessions and an audit log that only admins can read.

## Voice and https

Browsers only allow the microphone on `https://` or `localhost`. For colleagues on the network:

```sh
npm run cert      # creates certs/key.pem and certs/cert.pem (needs openssl)
npm start         # the server switches to https when certs/ exists
```

Everyone opens `https://<your-ip>:3000` and accepts the certificate warning once. Behind a real reverse proxy
(nginx, Caddy, a cloud load balancer) terminate TLS there instead and skip the certificate.

Voice is peer-to-peer (WebRTC) with Supabase Realtime for signalling, which works well up to about 6–8 people per channel.

## Hosting elsewhere

| Target | How |
| --- | --- |
| Node / VM | `npm run build && npm start`, keep it running with systemd or pm2 |
| Docker | `docker compose up --build` (needs `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env`) |
| Static host (Netlify, Vercel, S3, …) | `npm run build`, publish `dist/`, add a rewrite of all paths to `/index.html`, edit `dist/config.js` |

`GET /healthz` returns `ok` for load balancers.

## WSL2: let the network reach the server

WSL2 runs behind NAT, so the 172.x address only works from your own laptop. Pick one option:

**Mirrored networking (Windows 11 22H2+).** Add to `C:\Users\<you>\.wslconfig`, run `wsl --shutdown`, start the server again:

```ini
[wsl2]
networkingMode=mirrored
```

Then allow the port once in an admin PowerShell:

```powershell
New-NetFirewallRule -DisplayName "RAD Chat 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain
Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
```

**Port forwarding.** Run `scripts/expose-on-lan.ps1` in an admin PowerShell, again after every WSL restart.

If colleagues still cannot connect, check that Windows marks the network as Private or Domain.
Corporate Wi-Fi can also block traffic between devices (client isolation).

## Project structure

```
server.js                      Node host: static files, SPA fallback, /config.js, /healthz, optional https
supabase/migrations/           database schema, RLS policies and functions
scripts/                       generate-cert.mjs, expose-on-lan.ps1
src/
  config/AppConfig.ts          reads the Supabase settings
  core/                        types, errors, Emitter, Supabase client helpers
  services/                    one class per domain (Auth, Profile, Message, Team, Voice, ...)
  app/                         React contexts: services, auth, workspace
  components/                  Shell (rail, sidebar, members), chat, Avatar, Icon
  features/wordle/             Wordle rules, game classes, board, keyboard, modals
  features/craft/              bridge between RAD Craft and the database/Realtime
  craft/game.js                the RAD Craft game (three.js)
  pages/                       one component per route
  styles/                      Qualogy design tokens and per-area stylesheets
```

## Scripts

`npm run dev` · `npm run build` (typecheck + bundle) · `npm start` · `npm run typecheck` · `npm run cert`
