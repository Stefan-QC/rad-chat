# RAD Chat API

Python backend (FastAPI) for RAD Chat. It adds server-side features next to the React frontend and Supabase: GIF search, admin user management, message export, retention settings and scheduled maintenance jobs.

## Setup

```bash
cd api
python -m venv .venv
.venv\Scripts\activate        # Windows (Linux/macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
cp .env.example .env          # fill in the values
uvicorn app.main:app --port 8000
```

Python 3.11 or newer is required (developed on 3.14, the Docker image uses 3.12).

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `SUPABASE_URL` | | Project URL, for example `https://xyz.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | | Anon/publishable key, used only to verify user tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | | Service-role key. Server only, never expose it to the browser |
| `GIF_PROVIDER` | `giphy` | `giphy` or `klipy` |
| `GIPHY_API_KEY` | | Giphy API key |
| `KLIPY_API_KEY` | | KLIPY API key |
| `GIF_RATING` | `pg-13` | Content rating passed to the provider |
| `ALLOWED_ORIGINS` | | Comma separated CORS allowlist (wildcards are ignored) |
| `JOB_TOKEN` | | Shared secret for `X-Job-Token`; empty disables token access |
| `ENABLE_SCHEDULER` | `false` | Start the in-process scheduler |
| `TIMEZONE` | `Europe/Amsterdam` | Timezone of the schedule |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per-user request budget (token bucket) |
| `MAX_BODY_BYTES` | `65536` | Maximum request body size |
| `PORT` | `8000` | Port (used by your process manager; the Docker CMD uses 8000) |

## Endpoints

All endpoints live under `/api`. Authenticated routes expect `Authorization: Bearer <Supabase access token>`.

| Method and path | Access | Description |
| --- | --- | --- |
| `GET /api/health` | public | Returns `{"status":"ok"}` |
| `GET /api/gifs/search?q=&limit=24&pos=` | any active user | Search GIFs |
| `GET /api/gifs/trending?limit=24&pos=` | any active user | Trending GIFs |
| `GET /api/admin/users` | admin | List users (auth + profile merged) |
| `POST /api/admin/users` | admin | Create a user (guests need a future `expires_at`) |
| `POST /api/admin/users/invite` | admin | Invite by email |
| `POST /api/admin/users/{id}/deactivate` / `reactivate` | admin | Ban or unban, not yourself |
| `POST /api/admin/users/{id}/password` | admin | Set a new password (min 10 characters) |
| `PUT /api/admin/users/{id}/role` | admin | Change role, you cannot demote yourself |
| `GET /api/admin/export?channel_id=&since=&format=json\|csv` | admin | Streamed message export |
| `GET/PUT /api/admin/settings/retention` | admin | Message retention in days (0 keeps everything) |
| `POST /api/jobs/{name}` | admin or `X-Job-Token` | Run `expire_guests`, `purge_messages`, `post_celebrations` or `run_coffee_round` |

The `purge_messages` job also removes the pasted images of the deleted messages from the `chat-images` bucket (only paths of the form `channel/user/file`, in chunks of 100); the paths themselves are kept out of the audit log.

Every admin mutation is written to `audit_logs`. Passwords and tokens are never logged or audited.

### Database expectations

The API assumes these exist in Supabase: tables `profiles`, `messages`, `channels`, `audit_logs` and `app_settings (key, value)` with a unique `key`, a trigger that creates a profile for new auth users, and the functions `jobs_expire_guests`, `jobs_purge_messages`, `jobs_post_celebrations` and `jobs_run_coffee_round` that return `jsonb`.

### Scheduler

With `ENABLE_SCHEDULER=true` the app runs daily at 07:00 (`expire_guests`, `post_celebrations`, `purge_messages`) and Mondays at 09:00 (`run_coffee_round`) in `TIMEZONE`. Failures are logged without secrets and never stop the app. Run only one instance with the scheduler enabled, or trigger the jobs externally through `POST /api/jobs/{name}` with `X-Job-Token`.

### KLIPY

KLIPY parsing is best-effort. The structure of the `files` object is not documented in our notes, so the provider looks for nested `url` entries and picks small keys (`xs`, `sm`, ...) for the preview and medium keys (`md`, ...) for the full GIF, tolerating missing sizes. Verify it with a real key before relying on it.

## Security notes

- Tokens are verified against Supabase (`/auth/v1/user`) and cached for 30 seconds by hash; the profile (role, deactivated, expired) is checked on every request.
- Per-user in-memory rate limit, request body limit, security headers and an env based CORS allowlist.
- Only `https` GIF URLs from allowlisted provider hosts are returned.
- CSV export prefixes cells that start with `=`, `+`, `-`, `@` (and tab or carriage return) with an apostrophe.
- Errors returned to clients are generic; upstream details and stack traces stay out of responses and logs.
- The rate limiter and the token cache are per process; with several instances use a shared limiter in front.

## Tests

```bash
cd api
pytest -q
```

All HTTP is mocked with `respx`; there is no network access. `tests/test_function_coverage.py` fails and lists any function or method in `app/` that has no test named `test_<module>__<function>...`.

## How the frontend reaches it

The Node host that serves the React app proxies `/api/*` to this service (for example `http://localhost:8000`), so the browser stays on one origin and only needs the Supabase access token in the `Authorization` header.

## Docker

```bash
docker build -t rad-chat-api api
docker run --env-file api/.env -p 8000:8000 rad-chat-api
```
