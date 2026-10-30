-- Type race: lobbies, host rules, the state machine, report validation, pruning and the realtime topic.
-- Everything runs in one transaction, so now() stays fixed; the tests move the round timestamps instead of waiting.
do $test$
declare
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; guest uuid;
  lid uuid; l public.typerace_lobbies; sync jsonb; len int; res public.typerace_results;
begin
  perform t.make_user('seed_admin'); -- the first account is always an admin, so use it up
  u1 := t.make_user('racer_one'); u2 := t.make_user('racer_two'); u3 := t.make_user('racer_three'); u4 := t.make_user('racer_four');
  guest := t.make_user('racer_guest', 'guest');
  execute 'grant select, insert on realtime.messages to authenticated';

  -- creating a lobby
  perform t.as_user(u1);
  lid := public.typerace_create('nl', 60);
  select * into l from public.typerace_lobbies where id = lid;
  perform t.ok(l.host_id = u1 and l.language = 'nl' and l.duration_seconds = 60 and l.status = 'lobby' and l.round = 0, 'the creator becomes host of a new lobby');
  perform t.ok((select count(*) from public.typerace_players where lobby_id = lid) = 1, 'the host is the first player');
  perform t.throws(format('select public.typerace_create(%L, 30)', 'fr'), 'invalid_language', 'an unknown language is refused');
  perform t.throws(format('select public.typerace_create(%L, 45)', 'nl'), 'invalid_duration', 'an unknown duration is refused');
  perform t.as_user(guest);
  perform t.throws(format('select public.typerace_create(%L, 30)', 'nl'), 'forbidden', 'a guest cannot create a lobby');
  perform t.ok((select count(*) from public.typerace_lobbies) = 0, 'a guest cannot see lobbies');

  -- joining, settings and the host-only rules
  perform t.as_user(u2);
  perform public.typerace_join(lid);
  perform public.typerace_join(lid);
  perform t.ok((select count(*) from public.typerace_players where lobby_id = lid) = 2, 'joining twice does not add a second player');
  perform t.throws(format('select public.typerace_settings(%L, %L, 15)', lid, 'en'), 'forbidden', 'only the host can change the settings');
  perform t.throws(format('select public.typerace_start(%L)', lid), 'forbidden', 'only the host can start a round');
  perform t.throws(format('select public.typerace_join(%L)', gen_random_uuid()), 'not_found', 'joining a lobby that does not exist fails');
  perform t.as_user(u1);
  perform public.typerace_settings(lid, 'en', 15);
  select * into l from public.typerace_lobbies where id = lid;
  perform t.ok(l.language = 'en' and l.duration_seconds = 15, 'the host can change language and duration');

  -- starting: countdown, text and timing come from the server
  perform public.typerace_start(lid);
  select * into l from public.typerace_lobbies where id = lid;
  len := char_length(l.text);
  perform t.ok(l.status = 'countdown' and l.round = 1, 'starting moves the lobby to the countdown');
  perform t.ok(l.starts_at - l.countdown_at = interval '3 seconds', 'the countdown lasts 3 seconds');
  perform t.ok(l.ends_at - l.starts_at = interval '15 seconds', 'the round lasts as long as the host chose');
  perform t.ok(array_length(string_to_array(l.text, ' '), 1) = 26, 'a 15 second round gets 26 words');
  perform t.ok(ascii(left(l.text, 1)) between 65 and 90 and right(l.text, 1) = '.', 'the text starts with a capital and ends with a full stop');
  perform t.throws(format('select public.typerace_start(%L)', lid), 'round_in_progress', 'a second start is refused');
  perform t.throws(format('select public.typerace_settings(%L, %L, 30)', lid, 'nl'), 'round_in_progress', 'settings cannot change during a round');
  perform t.throws(format('select public.typerace_report(%L, 1, 0, 0, 0, false)', lid), 'not_started', 'nobody can report during the countdown');

  -- somebody who joins during the round waits for the next one
  perform t.as_user(u4);
  perform public.typerace_join(lid);
  perform t.ok((select play_from from public.typerace_players where lobby_id = lid and user_id = u4) = 2, 'a late joiner plays from the next round');

  -- the round starts: move time forward 7 seconds into the round
  perform t.as_owner();
  update public.typerace_lobbies set countdown_at = now() - interval '10 seconds', starts_at = now() - interval '7 seconds', ends_at = now() + interval '8 seconds' where id = lid;
  perform t.as_user(u1);
  sync := public.typerace_sync(lid);
  perform t.ok(sync ->> 'status' = 'playing' and (sync ->> 'in_lobby')::boolean, 'sync moves the countdown to playing');
  perform t.ok(sync ? 'server_now', 'sync returns the server time');

  -- reports are recomputed and validated by the server
  perform public.typerace_report(lid, 1, 40, 50, 45, false);
  select * into res from public.typerace_results where lobby_id = lid and round = 1 and user_id = u1;
  perform t.ok(res.accuracy = 90.0 and res.wpm between 68 and 69.5 and res.progress = round(100.0 * 40 / len, 1), 'the server computes wpm, accuracy and progress');
  perform t.throws(format('select public.typerace_report(%L, 1, 40, 50, 30, false)', lid), 'invalid_report', 'more correct characters than correct keystrokes is refused');
  perform t.throws(format('select public.typerace_report(%L, 1, 20, 500, 400, false)', lid), 'invalid_report', 'an impossible typing speed is refused');
  perform t.throws(format('select public.typerace_report(%L, 1, 20, 30, 25, true)', lid), 'invalid_report', 'finishing without the whole text is refused');
  perform t.throws(format('select public.typerace_report(%L, 2, 20, 30, 25, false)', lid), 'invalid_round', 'a report for another round is refused');
  perform t.as_user(u4);
  perform t.throws(format('select public.typerace_report(%L, 1, 5, 6, 6, false)', lid), 'not_a_participant', 'a waiting player cannot report');
  perform t.as_user(u3);
  perform t.throws(format('select public.typerace_report(%L, 1, 5, 6, 6, false)', lid), 'not_a_participant', 'an outsider cannot report');

  -- finishing: the round ends early once every participant is done
  perform t.as_user(u2);
  perform public.typerace_report(lid, 1, len, len + 3, len, true);
  select * into res from public.typerace_results where lobby_id = lid and round = 1 and user_id = u2;
  perform t.ok(res.finished and res.progress = 100.0 and res.finished_ms between 6900 and 7100, 'finishing stores the finish time');
  perform t.ok((select status from public.typerace_lobbies where id = lid) = 'playing', 'the round goes on while somebody is still typing');
  perform t.as_user(u1);
  perform public.typerace_report(lid, 1, len, len, len, true);
  select * into l from public.typerace_lobbies where id = lid;
  perform t.ok(l.status = 'finished' and l.finished_at is not null, 'the round ends when all participants finished');
  perform t.throws(format('select public.typerace_report(%L, 1, 1, 1, 1, false)', lid), 'round_over', 'nobody can report after the round');

  -- play again keeps the lobby and takes the waiting player along
  perform public.typerace_start(lid);
  select * into l from public.typerace_lobbies where id = lid;
  perform t.ok(l.status = 'countdown' and l.round = 2, 'play again starts the next round in the same lobby');
  perform t.ok((select count(*) from public.typerace_players where lobby_id = lid) = 3, 'the players stay in the lobby');

  -- the round also ends by time, after a short grace period
  perform t.as_owner();
  update public.typerace_lobbies set starts_at = now() - interval '20 seconds', ends_at = now() - interval '3 seconds' where id = lid;
  perform t.as_user(u2);
  sync := public.typerace_sync(lid);
  perform t.ok(sync ->> 'status' = 'finished', 'the round ends when the time is up');

  -- host transfer and cleanup (a test runs in one transaction, so give the players distinct join times first)
  perform t.as_owner();
  update public.typerace_players set joined_at = now() - case user_id when u1 then interval '3 minutes' when u2 then interval '2 minutes' else interval '1 minute' end where lobby_id = lid;
  perform t.as_user(u1);
  perform public.typerace_leave();
  select * into l from public.typerace_lobbies where id = lid;
  perform t.ok(l.host_id = u2, 'the host role moves to the player who joined first');
  perform t.as_user(u2);
  perform public.typerace_leave();
  perform t.as_user(u4);
  perform public.typerace_leave();
  perform t.ok(not exists (select 1 from public.typerace_lobbies where id = lid), 'a lobby without players is removed');
  perform t.ok(not exists (select 1 from public.typerace_results where lobby_id = lid), 'its results are removed too');

  -- one lobby at a time
  perform t.as_user(u1);
  lid := public.typerace_create('en', 30);
  perform public.typerace_create('nl', 30);
  perform t.ok(not exists (select 1 from public.typerace_lobbies where id = lid), 'creating a second lobby leaves the first one');

  -- players who stop sending heartbeats are dropped, and the host role follows
  perform t.as_user(u2);
  perform public.typerace_join((select lobby_id from public.typerace_players where user_id = u1));
  perform t.as_owner();
  update public.typerace_players set last_seen = now() - interval '2 minutes' where user_id = u1;
  perform t.as_user(u2);
  perform public.typerace_open_lobbies();
  perform t.ok(not exists (select 1 from public.typerace_players where user_id = u1), 'a silent player is removed');
  perform t.ok((select host_id from public.typerace_lobbies where id = (select lobby_id from public.typerace_players where user_id = u2)) = u2, 'the remaining player becomes host');

  -- realtime topic: only the players of a lobby can use it
  lid := (select lobby_id from public.typerace_players where user_id = u2);
  perform set_config('realtime.topic', 'typerace:' || lid, true);
  insert into realtime.messages (topic, extension) values ('typerace:' || lid, 'broadcast');
  perform t.ok(true, 'a player can broadcast on the lobby topic');
  perform t.as_user(u3);
  perform set_config('realtime.topic', 'typerace:' || lid, true);
  perform t.throws(format('insert into realtime.messages (topic, extension) values (%L, %L)', 'typerace:' || lid, 'broadcast'), 'row-level security', 'an outsider cannot broadcast on the lobby topic');
  perform t.ok((select count(*) from realtime.messages where topic = 'typerace:' || lid) = 0, 'an outsider cannot receive the lobby topic');
end
$test$;
