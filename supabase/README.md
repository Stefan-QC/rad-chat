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
| 013_typing.sql | Realtime topic `typing:<channel id>` for the typing indicator |
| 016_games.sql | Central game scores: sessions, server-side Tetris and DOOM scoring, TypeRace points, leaderboards and personal stats |
| 015_accounts_in_supabase.sql | Removes `set_user_role()`: roles and accounts are changed in Supabase only |
| 014_typerace.sql | Type race: lobbies, players, results, a server-side state machine and the `typerace:<lobby id>` realtime topic |

## Status of the live project (`qenndahdvjaeiiwefwws`)

001-012 are applied. **014, 015 and 016 must still be run** (type race, accounts only in Supabase, game scores).

## Tests

`npm run test:db` in the repository root runs `tests/*.test.sql` against a local embedded Postgres with stubs for the
Supabase schemas (`tests/bootstrap.sql`), so migrations can be checked without touching the project.

## Managing accounts

Accounts are created, changed, deactivated and deleted here in Supabase only; the app has no way to do it, not even for admins.
Create and delete users under Authentication → Users. For roles and status use the SQL editor (or the Table Editor on `profiles`):

```sql
-- role: member, admin or guest
update public.profiles set role = 'admin' where username = 'colleague';

-- a guest that expires automatically (a nightly job deactivates it)
update public.profiles set role = 'guest', expires_at = now() + interval '14 days' where username = 'colleague';

-- deactivate and reactivate (also ban the user under Authentication -> Users so they cannot sign in)
update public.profiles set deactivated_at = now() where username = 'colleague';
update public.profiles set deactivated_at = null where username = 'colleague';
```

Deleting a user also deletes their messages and other data (foreign keys cascade); deactivate instead to keep the history.

