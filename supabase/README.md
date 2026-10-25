# Supabase

Run the files in `migrations/` in order in the SQL editor of the project. Every table has row level security and writes
go through `security definer` functions with `search_path = ''`.

| File | Adds |
| --- | --- |
| 001_core.sql | profiles, teams, channels, messages, audit log, first-user-is-admin |
| 002_games_points_realtime.sql | points, Wordle, RAD Craft, voice sessions, Realtime; domain restriction off |
| 003_hardening.sql | extra grants and function lock-down |
| 004_user_settings.sql | per-user settings (theme, notifications) |
| 005_access_model.sql | roles, private channels, guests, moderators, `can_access_channel` |
| 006_message_features.sql | threads, reactions, pins, mentions, pasted images (bucket `chat-images`) |
| 007_notifications.sql | notifications and read state |
| 008_search.sql | full-text search |
| 009_workplace.sql | statuses, people directory, announcements |
| 010_work_tools.sql | polls, tasks, knowledge base, meetings |
| 011_social.sql | kudos, badges, quiz, coffee rounds (changes the `point_events` source check) |
| 012_jobs.sql | retention settings and the `jobs_*` functions used by the Python API |

## Status of the live project (`qenndahdvjaeiiwefwws`)

001-004 are applied. **005-012 are not applied yet**: run them in order, otherwise the new frontend pages fail on missing tables.

## Tests

`npm run test:db` in the repository root runs `tests/*.test.sql` against a local embedded Postgres with stubs for the
Supabase schemas (`tests/bootstrap.sql`), so migrations can be checked without touching the project.
