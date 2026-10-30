-- Central game scores: server-side score calculation and validation for Tetris and DOOM, the TypeRace points, and the leaderboards.
-- Everything runs in one transaction (now() stays fixed), so the tests move the session start times instead of waiting.
do $test$
declare
  a uuid; b uuid; c uuid; guest uuid;
  sid uuid; sid2 uuid; scored public.game_scores; lid uuid; len int; txt text; r jsonb;
  ra public.typerace_results; rb public.typerace_results; base_a int; base_b int; n int;
begin
  perform t.make_user('seed_admin'); -- the first account is always an admin, so use it up
  a := t.make_user('gamer_a'); b := t.make_user('gamer_b'); c := t.make_user('gamer_c'); guest := t.make_user('gamer_guest', 'guest');

  -- sessions
  perform t.as_user(guest);
  perform t.throws(format('select public.game_start(%L)', 'tetris'), 'forbidden', 'a guest cannot start a game');
  perform t.as_user(a);
  perform t.throws(format('select public.game_start(%L)', 'pong'), 'invalid_game', 'an unknown game is refused');
  perform t.throws(format('select public.game_start(%L)', 'typerace'), 'invalid_game', 'TypeRace scores come from races, not from a session');
  sid := public.game_start('tetris');
  perform t.ok(sid is not null, 'a signed-in player can start a Tetris run');

  -- Tetris: the server recomputes the score from the clears and the drops
  perform t.as_owner();
  update public.game_sessions set started_at = now() - interval '5 minutes' where id = sid;
  perform t.as_user(a);
  scored := public.game_submit(sid, '{"clears":[1,1,1,1,1,1,1,1,1,1,4],"soft":20,"hard":40,"pieces":40,"score":999999,"level":99}'::jsonb);
  -- 10 singles at level 1 = 1000, a Tetris at level 2 = 1600, soft drop 20, hard drop 80
  perform t.ok(scored.score = 2700, 'the score is computed by the server and a reported score is ignored');
  perform t.ok((scored.stats ->> 'lines')::int = 14 and (scored.stats ->> 'level')::int = 2 and (scored.stats ->> 'tetrises')::int = 1, 'lines, level and Tetrises are stored');
  perform t.throws(format('select public.game_submit(%L, %L)', sid, '{"clears":[1]}'), 'already_submitted', 'a run cannot be submitted twice');
  perform t.as_user(b);
  perform t.throws(format('select public.game_submit(%L, %L)', sid, '{"clears":[1]}'), 'invalid_session', 'nobody can submit somebody elses run');
  perform t.throws(format('select public.game_submit(%L, %L)', gen_random_uuid(), '{}'), 'invalid_session', 'an unknown session is refused');

  -- Tetris validation
  sid2 := public.game_start('tetris');
  perform t.throws(format('select public.game_submit(%L, %L)', sid2, '{"clears":[1,1,1],"pieces":1000}'), 'invalid_report', 'too many pieces for the time played');
  perform t.as_owner();
  update public.game_sessions set started_at = now() - interval '10 minutes' where id = sid2;
  perform t.as_user(b);
  perform t.throws(format('select public.game_submit(%L, %L)', sid2, '{"clears":[5],"pieces":10}'), 'invalid_report', 'a clear of five lines is impossible');
  perform t.throws(format('select public.game_submit(%L, %L)', sid2, '{"clears":[4,4,4],"pieces":10}'), 'invalid_report', 'more lines than the pieces can fill');
  perform t.throws(format('select public.game_submit(%L, %L)', sid2, '{"clears":[1],"soft":999,"pieces":10}'), 'invalid_report', 'more soft drop cells than possible');
  perform t.throws(format('select public.game_submit(%L, %L)', sid2, '[]'), 'invalid_report', 'a report must be an object');
  scored := public.game_submit(sid2, '{"clears":[1,2],"soft":10,"hard":20,"pieces":20}'::jsonb);
  perform t.ok(scored.score = 100 + 300 + 10 + 40, 'a valid run after rejected reports is accepted (the session stays open)');

  -- DOOM: the server recomputes the points per level
  sid := public.game_start('doom');
  perform t.as_owner();
  update public.game_sessions set started_at = now() - interval '5 minutes' where id = sid;
  perform t.as_user(b);
  scored := public.game_submit(sid, '{"levels":[{"level":1,"kills":{"imp":6},"completed":true,"health":80},{"level":2,"kills":{"imp":2,"brute":1},"completed":false,"health":0}]}'::jsonb);
  -- level 1: 6 x 100 + 500 completed + 800 health + 500 all enemies; level 2: 2 x 100 + 250
  perform t.ok(scored.score = 600 + 500 + 800 + 500 + 200 + 250, 'the DOOM score follows the point table');
  perform t.ok((scored.stats ->> 'levels_completed')::int = 1 and (scored.stats ->> 'kills')::int = 9 and (scored.stats ->> 'health_bonus')::int = 800, 'DOOM statistics are stored');

  -- DOOM validation
  sid := public.game_start('doom');
  perform t.as_owner();
  update public.game_sessions set started_at = now() - interval '5 minutes' where id = sid;
  perform t.as_user(b);
  perform t.throws(format('select public.game_submit(%L, %L)', sid, '{"levels":[{"level":1,"kills":{"imp":7},"completed":false}]}'), 'invalid_report', 'more kills than enemies in the level');
  perform t.throws(format('select public.game_submit(%L, %L)', sid, '{"levels":[{"level":2,"kills":{"imp":1},"completed":false}]}'), 'invalid_report', 'a run cannot skip level 1');
  perform t.throws(format('select public.game_submit(%L, %L)', sid, '{"levels":[{"level":1,"kills":{"imp":1},"completed":false},{"level":2,"kills":{},"completed":false}]}'), 'invalid_report', 'only the last level can be unfinished');
  perform t.throws(format('select public.game_submit(%L, %L)', sid, '{"levels":[{"level":1,"kills":{"imp":6},"completed":true,"health":0}]}'), 'invalid_report', 'a finished level needs health left');
  perform t.throws(format('select public.game_submit(%L, %L)', sid, '{"levels":[{"level":1,"kills":{"boss":1},"completed":false}]}'), 'invalid_report', 'no boss in level 1');
  perform t.throws(format('select public.game_submit(%L, %L)', sid, '{"levels":[]}'), 'invalid_report', 'a run needs at least one level');
  sid2 := public.game_start('doom');
  perform t.throws(format('select public.game_submit(%L, %L)', sid2, '{"levels":[{"level":1,"kills":{"imp":6},"completed":true,"health":100}]}'), 'invalid_report', 'a run that is finished impossibly fast is refused');

  -- leaderboards: best score per player, ranks and the personal numbers
  perform t.as_owner();
  insert into public.game_scores (user_id, game, score, stats, ref) values
    (a, 'tetris', 100, '{}', 'x:1'), (c, 'tetris', 2700, '{}', 'x:2'), (a, 'doom', 100, '{}', 'x:3'),
    (a, 'typerace', 900, '{}', 'x:4'), (b, 'typerace', 400, '{}', 'x:5');
  perform t.as_user(a);
  perform t.ok((select count(*) from public.game_leaderboard('tetris')) = 3, 'the Tetris leaderboard has one row per player');
  perform t.ok((select user_id from public.game_leaderboard('tetris') order by rank desc limit 1) = b and (select min(rank) from public.game_leaderboard('tetris')) = 1, 'the leaderboard is ordered by best score, highest first');
  perform t.ok((select score from public.game_leaderboard('tetris') where user_id = a) = 2700, 'only the best score of a player counts');
  perform t.ok((select rank from public.game_leaderboard('tetris') where user_id = b) = 3, 'equal scores share a rank and the next rank follows');
  perform t.ok((select count(*) from public.game_leaderboard('tetris', 2)) = 2, 'the limit is respected');
  perform t.ok((select count(*) from public.game_leaderboard('pong')) = 0, 'an unknown game has no rows');

  -- overall ranking on rank points, not on raw points
  -- tetris (3 players): a and c share rank 1 -> 100 each, b rank 3 -> 33.3; doom (2 players): b 2450+... best, a 100
  r := (select jsonb_agg(jsonb_build_object('user', o.user_id, 'rank', o.rank, 'total', o.total) order by o.rank, o.total desc) from public.game_overall(10) o);
  perform t.ok(jsonb_array_length(r) = 3, 'the overall ranking lists everybody who scored');
  perform t.ok((select o.total from public.game_overall(10) o where o.user_id = a) > (select o.total from public.game_overall(10) o where o.user_id = c), 'playing more games earns more rank points');
  perform t.ok((select o.per_game -> 'typerace' ->> 'points' from public.game_overall(10) o where o.user_id = a) = '100.0', 'the best player of a game gets 100 rank points');
  perform t.ok((select o.per_game -> 'typerace' ->> 'points' from public.game_overall(10) o where o.user_id = b) = '50.0', 'second of two players gets 50 rank points');
  perform t.ok((select o.per_game ? 'doom' from public.game_overall(10) o where o.user_id = c) = false, 'a game you never played is not in your breakdown');

  r := public.game_my_stats();
  perform t.ok((r -> 'games' -> 'tetris' ->> 'best')::int = 2700 and (r -> 'games' -> 'tetris' ->> 'played')::int = 2, 'personal best and number of games');
  perform t.ok((r -> 'games' -> 'typerace' ->> 'position')::int = 1 and (r -> 'games' -> 'typerace' ->> 'players')::int = 2, 'personal leaderboard position');
  perform t.ok((r ->> 'total_played')::int = 4 and (r -> 'overall' ->> 'rank') is not null, 'total games played and the overall position');
  perform t.ok((r -> 'games' -> 'doom' ->> 'last_score')::int = 100, 'the latest score is reported');
  perform t.as_user(c);
  perform t.ok((public.game_my_stats() -> 'games' -> 'doom' ->> 'best') is null, 'no best score for a game you never played');

  perform t.as_user(guest);
  perform t.ok((select count(*) from public.game_scores) = 0, 'a guest cannot read the scores');
  perform t.as_user(a);
  perform t.throws(format('insert into public.game_scores (user_id, game, score, ref) values (%L, %L, 1, %L)', a, 'tetris', 'hack:1'), 'permission denied', 'nobody can write scores directly');
  perform t.throws(format('update public.game_scores set score = 999999 where user_id = %L', a), 'permission denied', 'nobody can change a score');

  -- TypeRace: points are awarded by the server when a round finishes
  perform t.as_owner();
  delete from public.game_scores;
  perform t.as_user(a);
  lid := public.typerace_create('en', 15);
  perform t.as_user(b);
  perform public.typerace_join(lid);
  perform t.as_user(c);
  perform public.typerace_join(lid);
  perform t.as_user(a);
  perform public.typerace_start(lid);
  select text into txt from public.typerace_lobbies where id = lid;
  len := char_length(txt);
  perform t.as_owner();
  update public.typerace_lobbies set countdown_at = now() - interval '10 seconds', starts_at = now() - interval '7 seconds', ends_at = now() + interval '8 seconds' where id = lid;
  perform t.as_user(a);
  perform public.typerace_sync(lid);
  perform public.typerace_report(lid, 1, len, len + 4, len + 1, true);
  perform t.as_user(b);
  perform public.typerace_report(lid, 1, len / 2, len, len - 5, false);
  -- c joined but never typed, so c is not an active player
  perform t.as_owner();
  update public.typerace_lobbies set starts_at = now() - interval '20 seconds', ends_at = now() - interval '3 seconds' where id = lid;
  perform t.as_user(a);
  perform public.typerace_sync(lid);
  perform t.ok((select status from public.typerace_lobbies where id = lid) = 'finished', 'the round is finished');
  select * into ra from public.typerace_results where lobby_id = lid and round = 1 and user_id = a;
  select * into rb from public.typerace_results where lobby_id = lid and round = 1 and user_id = b;
  base_a := round(ra.wpm * ra.accuracy / 100 * ra.progress / 100 * 10)::int;
  base_b := round(rb.wpm * rb.accuracy / 100 * rb.progress / 100 * 10)::int;
  perform t.ok((select count(*) from public.game_scores where game = 'typerace') = 2, 'only players who typed get a score');
  perform t.ok((select score from public.game_scores where user_id = a and game = 'typerace') = base_a + 500, 'first place: base score + 500');
  perform t.ok((select score from public.game_scores where user_id = b and game = 'typerace') = base_b + 250, 'second place: base score + 250');
  perform t.ok((select (stats ->> 'base')::int = base_a and (stats ->> 'bonus')::int = 500 and (stats ->> 'place')::int = 1 and (stats ->> 'players')::int = 2
                from public.game_scores where user_id = a and game = 'typerace'), 'the breakdown (base, bonus, place, players) is stored');
  perform t.ok(not exists (select 1 from public.game_scores where user_id = c), 'a player who never typed gets no score');
  perform private.typerace_award(lid, 1);
  perform t.ok((select count(*) from public.game_scores where game = 'typerace') = 2, 'a round is never scored twice');

  -- a solo race has no placement bonus
  perform t.as_user(b);
  perform public.typerace_leave();
  perform t.as_user(c);
  perform public.typerace_leave();
  perform t.as_user(a);
  perform public.typerace_start(lid);
  perform t.as_owner();
  update public.typerace_lobbies set countdown_at = now() - interval '10 seconds', starts_at = now() - interval '7 seconds', ends_at = now() + interval '8 seconds' where id = lid;
  perform t.as_user(a);
  perform public.typerace_sync(lid);
  perform public.typerace_report(lid, 2, 30, 35, 33, false);
  perform t.as_owner();
  update public.typerace_lobbies set starts_at = now() - interval '20 seconds', ends_at = now() - interval '3 seconds' where id = lid;
  perform t.as_user(a);
  perform public.typerace_sync(lid);
  select * into ra from public.typerace_results where lobby_id = lid and round = 2 and user_id = a;
  perform t.ok((select (stats ->> 'bonus')::int from public.game_scores where ref = 'typerace:' || lid || ':2:' || a) = 0, 'no placement bonus when only one player typed');
  perform t.ok((select score from public.game_scores where ref = 'typerace:' || lid || ':2:' || a) = round(ra.wpm * ra.accuracy / 100 * ra.progress / 100 * 10)::int, 'the solo score is the base score, rounded');
end
$test$;
