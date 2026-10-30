-- Central score system for the games (TypeRace, Tetris, DOOM). The database decides every score:
-- clients only report what happened in a game, the server recomputes the score and refuses impossible reports.

-- ---------- sessions and scores ----------
-- A session is opened when a Tetris or DOOM run starts and can be submitted exactly once; this blocks duplicates and replays.
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null check (game in ('tetris', 'doom')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index game_sessions_user_idx on public.game_sessions (user_id, started_at desc);

create table public.game_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null check (game in ('typerace', 'tetris', 'doom')),
  score int not null check (score >= 0),
  stats jsonb not null default '{}'::jsonb,
  ref text not null unique, -- 'session:<id>' or 'typerace:<lobby>:<round>:<user>', so one event is never scored twice
  created_at timestamptz not null default now()
);
create index game_scores_game_idx on public.game_scores (game, score desc);
create index game_scores_user_idx on public.game_scores (user_id, game, created_at desc);

alter table public.game_sessions enable row level security;
alter table public.game_scores enable row level security;
create policy "own game sessions" on public.game_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "scores are visible inside the company" on public.game_scores for select to authenticated using (private.is_active() and not private.is_guest());
revoke insert, update, delete on public.game_sessions, public.game_scores from authenticated;

-- ---------- Tetris ----------
-- The report holds the line clears in order ("clears": [1, 4, 2, ...]), the cells dropped with soft and hard drops and the number of pieces.
-- The score is recomputed: line points x the level at that moment (level = 1 + lines / 10), plus 1 per soft drop cell and 2 per hard drop cell.
create function private.game_score_tetris(report jsonb, elapsed_ms numeric) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  clears jsonb := coalesce(report -> 'clears', '[]'::jsonb);
  soft bigint := coalesce((report ->> 'soft')::bigint, 0);
  hard bigint := coalesce((report ->> 'hard')::bigint, 0);
  pieces bigint := coalesce((report ->> 'pieces')::bigint, 0);
  n int; lines bigint := 0; points bigint := 0; level int; tetrises int := 0; i int;
begin
  if jsonb_typeof(clears) <> 'array' or jsonb_array_length(clears) > 3000 then raise exception 'invalid_report'; end if;
  if soft < 0 or hard < 0 or pieces < 0 or pieces > 20000 then raise exception 'invalid_report'; end if;
  for i in 0..jsonb_array_length(clears) - 1 loop
    n := (clears ->> i)::int;
    if n is null or n not between 1 and 4 then raise exception 'invalid_report'; end if;
    level := 1 + (lines / 10)::int;
    points := points + (case n when 1 then 100 when 2 then 300 when 3 then 500 else 800 end) * level;
    lines := lines + n;
    if n = 4 then tetrises := tetrises + 1; end if;
  end loop;
  -- physics of the game: every piece has 4 cells and a line needs 10, a piece falls 20 rows at most, and nobody places pieces faster than ~8 per second
  if lines * 10 > pieces * 4 or soft > pieces * 22 or hard > pieces * 22 then raise exception 'invalid_report'; end if;
  if pieces > elapsed_ms / 120 + 5 then raise exception 'invalid_report'; end if;
  points := points + soft + hard * 2;
  return jsonb_build_object('score', points, 'stats', jsonb_build_object(
    'lines', lines, 'level', 1 + (lines / 10)::int, 'pieces', pieces, 'soft_drop_cells', soft, 'hard_drop_cells', hard,
    'tetrises', tetrises, 'duration_ms', floor(elapsed_ms)));
end $$;

-- ---------- DOOM ----------
-- Enemies per level; the client has the same table (frontend/src/features/doom/levels.ts) and a test keeps both in line.
create function private.doom_level_totals(p_level int) returns jsonb language sql immutable set search_path = '' as $$
  select case p_level
    when 1 then '{"imp": 6, "brute": 0, "boss": 0}'::jsonb
    when 2 then '{"imp": 6, "brute": 3, "boss": 0}'::jsonb
    when 3 then '{"imp": 4, "brute": 4, "boss": 1}'::jsonb
  end;
$$;

-- The report lists the levels played in order: {"levels": [{"level": 1, "kills": {"imp": 6}, "completed": true, "health": 80}, ...]}.
-- Points: imp 100, brute 250, boss 1000, level completed 500, 10 per remaining HP on completion, 500 for killing every enemy of a level.
create function private.game_score_doom(report jsonb, elapsed_ms numeric) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  levels jsonb := coalesce(report -> 'levels', '[]'::jsonb);
  entry jsonb; totals jsonb; i int; lvl int; imps int; brutes int; bosses int; hp int; done boolean;
  points bigint := 0; kills_total int := 0; completed_count int := 0; health_bonus bigint := 0; clean_levels int := 0; min_ms numeric := 0;
begin
  if jsonb_typeof(levels) <> 'array' or jsonb_array_length(levels) not between 1 and 3 then raise exception 'invalid_report'; end if;
  for i in 0..jsonb_array_length(levels) - 1 loop
    entry := levels -> i;
    lvl := (entry ->> 'level')::int;
    if lvl is distinct from i + 1 then raise exception 'invalid_report'; end if;
    totals := private.doom_level_totals(lvl);
    imps := coalesce((entry -> 'kills' ->> 'imp')::int, 0);
    brutes := coalesce((entry -> 'kills' ->> 'brute')::int, 0);
    bosses := coalesce((entry -> 'kills' ->> 'boss')::int, 0);
    done := coalesce((entry ->> 'completed')::boolean, false);
    hp := coalesce((entry ->> 'health')::int, 0);
    if imps not between 0 and (totals ->> 'imp')::int or brutes not between 0 and (totals ->> 'brute')::int
       or bosses not between 0 and (totals ->> 'boss')::int then raise exception 'invalid_report'; end if;
    if done and hp not between 1 and 100 then raise exception 'invalid_report'; end if;
    -- only the last level of a run can be unfinished, and a run ends after the last level
    if not done and i < jsonb_array_length(levels) - 1 then raise exception 'invalid_report'; end if;
    points := points + imps * 100 + brutes * 250 + bosses * 1000;
    kills_total := kills_total + imps + brutes + bosses;
    min_ms := min_ms + (imps + brutes + bosses * 4) * 500;
    if done then
      points := points + 500 + hp * 10;
      health_bonus := health_bonus + hp * 10;
      completed_count := completed_count + 1;
      min_ms := min_ms + 6000;
    end if;
    if imps = (totals ->> 'imp')::int and brutes = (totals ->> 'brute')::int and bosses = (totals ->> 'boss')::int then
      points := points + 500;
      clean_levels := clean_levels + 1;
    end if;
  end loop;
  if elapsed_ms < min_ms then raise exception 'invalid_report'; end if;
  return jsonb_build_object('score', points, 'stats', jsonb_build_object(
    'levels_played', jsonb_array_length(levels), 'levels_completed', completed_count, 'kills', kills_total, 'health_bonus', health_bonus,
    'all_enemies_levels', clean_levels, 'duration_ms', floor(elapsed_ms)));
end $$;

-- ---------- starting and submitting a run ----------
create function public.game_start(p_game text) returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); sid uuid;
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if p_game not in ('tetris', 'doom') then raise exception 'invalid_game'; end if;
  delete from public.game_sessions where user_id = me and submitted_at is null and started_at < now() - interval '1 day';
  if (select count(*) from public.game_sessions where user_id = me and started_at > now() - interval '1 hour') >= 60 then raise exception 'rate_limited'; end if;
  insert into public.game_sessions (user_id, game) values (me, p_game) returning id into sid;
  return sid;
end $$;

-- Recomputes the score from the report, stores it and closes the session. A session can only be submitted once.
create function public.game_submit(p_session uuid, p_report jsonb) returns public.game_scores language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); s public.game_sessions; elapsed numeric; result jsonb; scored public.game_scores;
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  select * into s from public.game_sessions where id = p_session and user_id = me for update;
  if not found then raise exception 'invalid_session'; end if;
  if s.submitted_at is not null then raise exception 'already_submitted'; end if;
  elapsed := extract(epoch from now() - s.started_at) * 1000;
  if jsonb_typeof(p_report) <> 'object' then raise exception 'invalid_report'; end if;
  result := case s.game when 'tetris' then private.game_score_tetris(p_report, elapsed) else private.game_score_doom(p_report, elapsed) end;
  insert into public.game_scores (user_id, game, score, stats, ref)
  values (me, s.game, (result ->> 'score')::int, result -> 'stats', 'session:' || s.id) returning * into scored;
  update public.game_sessions set submitted_at = now() where id = s.id;
  return scored;
end $$;

-- ---------- leaderboards ----------
-- Best score per player for one game, top N. Equal scores share a rank.
create function public.game_leaderboard(p_game text, p_limit int default 10)
returns table (rank int, user_id uuid, username text, display_name text, avatar_color text, score int, achieved_at timestamptz, stats jsonb)
language sql stable set search_path = '' as $$
  with best as (
    select distinct on (s.user_id) s.user_id, s.score, s.created_at, s.stats
    from public.game_scores s where s.game = p_game order by s.user_id, s.score desc, s.created_at asc
  )
  select (rank() over (order by b.score desc))::int, b.user_id, p.username, p.display_name, p.avatar_color, b.score, b.created_at, b.stats
  from best b join public.profiles p on p.id = b.user_id
  order by 1, b.created_at
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

-- The overall ranking does not add raw points (the games use different scales). Per game every player gets a rank score from 0 to 100:
-- 100 x (players - rank + 1) / players, so the best player of a game gets 100. A player who never played a game gets 0 for it.
create function public.game_overall(p_limit int default 10)
returns table (rank int, user_id uuid, username text, display_name text, avatar_color text, total numeric, per_game jsonb)
language sql stable set search_path = '' as $$
  with best as (
    select distinct on (s.user_id, s.game) s.user_id, s.game, s.score
    from public.game_scores s order by s.user_id, s.game, s.score desc
  ), ranked as (
    select b.*, rank() over (partition by b.game order by b.score desc) as game_rank, count(*) over (partition by b.game) as players
    from best b
  ), points as (
    select r.user_id, sum(round(100.0 * (r.players - r.game_rank + 1) / r.players, 1)) as total,
           jsonb_object_agg(r.game, jsonb_build_object('rank', r.game_rank, 'players', r.players, 'score', r.score,
                                                       'points', round(100.0 * (r.players - r.game_rank + 1) / r.players, 1))) as per_game
    from ranked r group by r.user_id
  )
  select (rank() over (order by x.total desc))::int, x.user_id, p.username, p.display_name, p.avatar_color, x.total, x.per_game
  from points x join public.profiles p on p.id = x.user_id
  order by 1, p.display_name
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

-- Personal statistics for the signed-in player: best, games played, latest score and leaderboard position per game, and the overall position.
create function public.game_my_stats() returns jsonb language sql stable set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  games(game) as (values ('typerace'), ('tetris'), ('doom')),
  per_game as (
    select g.game,
      (select max(s.score) from public.game_scores s, me where s.user_id = me.id and s.game = g.game) as best,
      (select count(*) from public.game_scores s, me where s.user_id = me.id and s.game = g.game) as played,
      (select s.score from public.game_scores s, me where s.user_id = me.id and s.game = g.game order by s.created_at desc limit 1) as last_score,
      (select s.created_at from public.game_scores s, me where s.user_id = me.id and s.game = g.game order by s.created_at desc limit 1) as last_at,
      (select l.rank from public.game_leaderboard(g.game, 100) l, me where l.user_id = me.id) as position,
      (select count(distinct s.user_id) from public.game_scores s where s.game = g.game) as players
    from games g
  )
  select jsonb_build_object(
    'games', coalesce((select jsonb_object_agg(pg.game, jsonb_build_object(
        'best', pg.best, 'played', pg.played, 'last_score', pg.last_score, 'last_at', pg.last_at, 'position', pg.position, 'players', pg.players)) from per_game pg), '{}'::jsonb),
    'total_played', coalesce((select sum(pg.played) from per_game pg), 0),
    'overall', (select jsonb_build_object('rank', o.rank, 'total', o.total) from public.game_overall(100) o, me where o.user_id = me.id)
  );
$$;

-- ---------- TypeRace points ----------
-- Base score = WPM x (accuracy / 100) x (progress / 100) x 10. Placement bonus 500 / 250 / 100 for places 1 / 2 / 3, only when at least two players
-- actually typed. The result is rounded to a whole number. One row per player per round (ref is unique), so a round is never scored twice.
create function private.typerace_award(p_lobby uuid, p_round int) returns void language plpgsql security definer set search_path = '' as $$
declare active int; lang text; secs int;
begin
  select language, duration_seconds into lang, secs from public.typerace_lobbies where id = p_lobby;
  select count(*) into active from public.typerace_results where lobby_id = p_lobby and round = p_round and keystrokes > 0;
  insert into public.game_scores (user_id, game, score, stats, ref)
  select x.user_id, 'typerace', round(x.base)::int + x.bonus,
         jsonb_build_object('wpm', x.wpm, 'accuracy', x.accuracy, 'progress', x.progress, 'place', x.place, 'players', active,
                            'base', round(x.base)::int, 'bonus', x.bonus, 'finished', x.finished, 'finished_ms', x.finished_ms,
                            'language', lang, 'duration', secs, 'lobby', p_lobby, 'round', p_round),
         'typerace:' || p_lobby || ':' || p_round || ':' || x.user_id
  from (
    select r.*, r.wpm * r.accuracy / 100 * r.progress / 100 * 10 as base,
           row_number() over (order by r.finished desc, r.finished_ms asc nulls last, r.progress desc, r.wpm desc, r.user_id) as place,
           case when active >= 2 then case row_number() over (order by r.finished desc, r.finished_ms asc nulls last, r.progress desc, r.wpm desc, r.user_id)
                                      when 1 then 500 when 2 then 250 when 3 then 100 else 0 end else 0 end as bonus
    from public.typerace_results r where r.lobby_id = p_lobby and r.round = p_round and r.keystrokes > 0
  ) x
  on conflict (ref) do nothing;
end $$;

-- The state machine of 014 with one addition: when a round finishes, its scores are awarded.
create or replace function private.typerace_advance(p_lobby uuid) returns void language plpgsql security definer set search_path = '' as $$
declare l public.typerace_lobbies; participants int; done int;
begin
  select * into l from public.typerace_lobbies where id = p_lobby for update;
  if not found then return; end if;
  if l.status = 'countdown' and now() >= l.starts_at then
    update public.typerace_lobbies set status = 'playing', updated_at = now() where id = l.id;
    l.status := 'playing';
  end if;
  if l.status = 'playing' then
    select count(*) into participants from public.typerace_players where lobby_id = l.id and play_from <= l.round;
    select count(*) into done from public.typerace_results r
      where r.lobby_id = l.id and r.round = l.round and r.finished
        and exists (select 1 from public.typerace_players p where p.lobby_id = l.id and p.user_id = r.user_id and p.play_from <= l.round);
    if now() >= l.ends_at + interval '2 seconds' or participants = 0 or done >= participants then
      update public.typerace_lobbies set status = 'finished', finished_at = now(), updated_at = now() where id = l.id;
      perform private.typerace_award(l.id, l.round);
    end if;
  end if;
end $$;

select private.lock_down_functions();
