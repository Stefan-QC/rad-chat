# Supabase

Run the files in `migrations/` in order in the SQL editor of the project. Every table has row level security and writes
go through `security definer` functions with `search_path = ''`.

| File | Adds |
| --- | --- |
| 001_core.sql | accounts/profiles, teams, channels, messages, audit log |
| 002_games_points_realtime.sql | points and leaderboards, Wordle, RAD Craft world, Realtime; domain restriction off |
| 003_hardening.sql | fixed search_path on two helpers, indexes on foreign keys |
| 004_user_settings.sql | per-user settings and the function lock-down helper |
| 005_access_model.sql | guests, deactivation, private channels, direct and group chats, roles per team/channel |
| 006_message_features.sql | threads, reactions, pins, image and GIF attachments, checked `send_message()` |
| 007_notifications.sql | notifications and per-channel read state |
| 008_search.sql | full-text search limited by RLS |
| 009_workplace.sql | status, work plans, on-call rosters, birthdays and anniversaries |
| 010_work_tools.sql | polls, tasks, knowledge base, meeting notes |
| 011_social.sql | kudos, daily quiz, badges, coffee matching, period leaderboards (changes the `point_events` source check) |
| 012_jobs.sql | `jobs_*` functions, service role only |

## Status of the live project (`qenndahdvjaeiiwefwws`)

001-004 are applied. **005-012 are not applied yet**: run them in order, otherwise the new frontend pages fail on missing tables.

## Tests

`npm run test:db` in the repository root runs `tests/*.test.sql` against a local embedded Postgres with stubs for the
Supabase schemas (`tests/bootstrap.sql`), so migrations can be checked without touching the project.
