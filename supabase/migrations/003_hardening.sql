-- Small follow-ups from the Supabase advisors: fixed search_path on two helper functions and indexes on foreign keys.

alter function private.wordle_today() set search_path = '';
alter function private.wordle_marks(text, text) set search_path = '';

create index if not exists channels_team_idx on public.channels (team_id);
create index if not exists teams_created_by_idx on public.teams (created_by);
create index if not exists craft_blocks_updated_by_idx on public.craft_blocks (updated_by);
