# RAD Chat

Company chat for colleagues: channels, threads, reactions, polls, pasted screenshots, GIFs, teams, voice with screen sharing,
notifications, search, people directory, tasks, knowledge base, meetings, kudos, a daily Dutch Wordle, a shared block world
and a leaderboard. There is a settings page (gear icon) and a light/dark theme for the whole site.

## Quick start

You need [Node.js](https://nodejs.org) 18+ and [Python](https://python.org) 3.11+.

```sh
npm run setup      # once: installs everything, builds the app, creates a certificate
npm start          # starts the web host and the API together
```

On Windows you can also double-click `start.cmd` (it runs the setup the first time).

`npm start` prints the addresses colleagues on the same network can open, for example `https://192.168.1.20:3000`.
Everyone uses the same Supabase database. Accept the browser warning for the self-signed certificate once; voice needs https.
If others cannot connect, run `npm run setup -- --firewall` once in an admin terminal (Windows) and check that the network is
marked Private. Corporate Wi-Fi can also block traffic between devices.

All settings live in one file, `.env` in the project folder (`npm run setup` creates it from `.env.example`):
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret, server only) and optionally `GIPHY_API_KEY`
(or `GIF_PROVIDER=klipy` with `KLIPY_API_KEY`).

## Project structure

```
frontend/                 React + Vite + TypeScript app
  src/core                types, errors, Supabase helpers, markdown, formatting
  src/services            one class per domain (Auth, Message, Team, Voice, ...)
  src/app                 React contexts
  src/components          shell, chat, admin, people, tasks, ui primitives
  src/pages               one component per route (loaded on demand)
  src/features            Wordle and RAD Craft
  src/styles              Qualogy design tokens (light and dark) and stylesheets
backend/
  server/                 Node host (no dependencies): static files, /api proxy, security headers, starts the API
  api/                    Python FastAPI: GIFs, admin tools, export, scheduled jobs (see backend/api/README.md)
supabase/
  migrations/             database schema, RLS policies and functions (see supabase/README.md)
  tests/                  SQL tests on a local embedded Postgres
scripts/                  setup, certificate and test helpers
Dockerfile, render.yaml   one image with everything, and a Render blueprint
```

The browser only talks to Supabase (data, auth, realtime) and to the Node host (`/api/*`, which is forwarded to the Python API).
Writes always go through `security definer` functions with row level security on every table.

## Set up Supabase (once)

1. Run every file in `supabase/migrations/` in order (001 up to 012) in the SQL editor of your project.
2. Create accounts under **Authentication → Users → Add user** (tick **Auto Confirm User**). The first account becomes an admin;
   admins can create and manage users on the Admin page.
3. Under **Authentication → Providers → Email**, switch off **Allow new users to sign up**.

## Keep it running for everyone (deploying)

Running on your own computer means the chat is only up while that computer is on. To keep it available all the time, host the
Docker image on a server:

| Option | How |
| --- | --- |
| Render | Push the repository to GitHub, create a **Blueprint** from `render.yaml`, fill in the secrets. Render provides https. |
| Any Docker host (Fly.io, Railway, Azure, a VM) | `docker build -t rad-chat .` and run it with the `.env` values as environment variables, port 3000. |
| `docker compose up --build` | Same image on any machine with Docker, settings from `.env`. |

The scheduled jobs (birthdays, retention, coffee rounds) need the service to stay awake, so avoid plans that sleep when idle.
Behind a platform that provides https you do not need the certificate.

## Tests

| Command | What it checks |
| --- | --- |
| `npm test` | frontend (vitest) and API (pytest) |
| `npm run test:db` | SQL tests on a local embedded Postgres: RLS, RPCs, triggers (no Supabase project needed) |

CI (`.github/workflows/ci.yml`) runs the frontend tests, the build and the API tests.

## Development

`npm run dev` starts Vite on http://localhost:5173 and proxies `/api` to a locally running API
(`npm start` in another terminal also starts the API). Other commands: `npm run build`, `npm run cert`.
