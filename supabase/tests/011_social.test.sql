-- Social: kudos, daily quiz, badges and period leaderboards.
do $test$
declare
  u1 uuid; u2 uuid; u3 uuid; guest uuid; gen uuid; qid int; right_choice smallint; wrong_choice smallint; state jsonb; i int; tid uuid;
begin
  perform t.make_user('seed_admin');
  u1 := t.make_user('uone'); u2 := t.make_user('utwo'); u3 := t.make_user('uthree'); guest := t.make_user('guest', 'guest');
  select id into gen from public.channels where name = 'general' and team_id is null;

  -- ===== kudos =====
  perform t.as_user(u1);
  perform public.give_kudos(u2, 'Bedankt voor je hulp!');
  perform t.as_owner();
  perform t.ok((select sum(points) from public.point_events where user_id = u2 and source = 'kudos') = 5, 'the receiver gets 5 points');
  perform t.ok((select count(*) from public.notifications where user_id = u2 and kind = 'kudos') = 1, 'the receiver is notified');
  perform t.as_user(u1);
  perform t.throws(format('select public.give_kudos(%L, %L)', u1, 'voor mezelf'), 'not_yourself', 'you cannot give kudos to yourself');
  perform t.throws(format('select public.give_kudos(%L, %L)', guest, 'hoi'), 'invalid_user', 'guests cannot receive kudos');
  perform t.throws(format('select public.give_kudos(%L, %L)', u2, '   '), 'invalid_message', 'kudos need a message');
  perform public.give_kudos(u2, 'Nog een keer');
  perform public.give_kudos(u3, 'Top werk');
  perform t.throws(format('select public.give_kudos(%L, %L)', u3, 'Vierde'), 'daily_limit', 'at most three kudos per day');
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.kudos) = 3, 'kudos are visible to colleagues');
  perform t.throws(format('insert into public.kudos (from_user, to_user, message) values (%L, %L, %L)', u3, u2, 'vals'), 'permission denied', 'kudos cannot be inserted directly');
  perform t.as_user(guest);
  perform t.ok((select count(*) from public.kudos) = 0, 'guests do not see kudos');

  -- ===== quiz =====
  perform t.as_owner();
  qid := private.quiz_question_for(private.wordle_today());
  select correct into right_choice from public.quiz_questions where id = qid;
  wrong_choice := ((right_choice + 1) % 4)::smallint;
  perform t.as_user(u2);
  state := public.quiz_today();
  perform t.ok((state ->> 'available')::boolean and jsonb_array_length(state -> 'options') = 4 and state ->> 'correct_index' is null, 'the question is shown without its answer');
  perform t.ok((select count(*) from public.quiz_questions) = 0, 'the questions table cannot be read directly');
  perform t.throws('select public.answer_quiz(7::smallint)', 'invalid_choice', 'a choice must be between 0 and 3');
  state := public.answer_quiz(right_choice);
  perform t.ok((state ->> 'correct')::boolean and (state ->> 'points')::int = 10 and (state ->> 'correct_index')::int = right_choice, 'a correct answer earns 10 points and reveals the answer');
  perform t.throws(format('select public.answer_quiz(%s::smallint)', right_choice), 'already_answered', 'you can answer only once a day');
  perform t.as_user(u3);
  state := public.answer_quiz(wrong_choice);
  perform t.ok(not (state ->> 'correct')::boolean and (state ->> 'points')::int = 0, 'a wrong answer earns nothing');
  perform t.as_owner();
  perform t.ok((select count(*) from public.point_events where source = 'quiz') = 1, 'only the correct answer created points');
  perform t.as_user(guest);
  perform t.throws('select public.quiz_today()', 'forbidden', 'guests cannot play the quiz');

  -- ===== badges =====
  perform t.as_user(u1);
  perform public.send_message(gen, 'mijn eerste bericht');
  perform t.ok(exists (select 1 from public.user_badges where user_id = u1 and badge_id = 'first_message'), 'the first message earns a badge');
  perform t.ok((select count(*) from public.notifications where user_id = u1 and kind = 'system') >= 1, 'earning a badge sends a notification');
  perform t.ok(not exists (select 1 from public.user_badges where user_id = u1 and badge_id = 'chatterbox'), 'the chatterbox badge is not given too early');
  perform t.as_owner();
  alter table public.messages disable trigger messages_rate_limit; -- this test loads many messages at once
  for i in 1..100 loop
    insert into public.messages (channel_id, user_id, body) values (gen, u1, 'bericht ' || i);
  end loop;
  perform t.as_user(u1);
  perform t.ok(exists (select 1 from public.user_badges where user_id = u1 and badge_id = 'chatterbox'), 'sending 100 messages earns the chatterbox badge');
  tid := public.create_team('Badge Team');
  perform t.ok(exists (select 1 from public.user_badges where user_id = u1 and badge_id = 'team_player'), 'joining a team earns a badge');
  perform t.ok(exists (select 1 from public.user_badges where user_id = u2 and badge_id = 'quiz_five') = false, 'badges that are not earned stay away');
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.badges) = 9, 'the badge catalogue is readable');
  perform t.ok((select count(*) from public.user_badges where user_id = u1) >= 3, 'earned badges are visible to colleagues');

  -- ===== period leaderboards =====
  perform t.as_user(u1);
  perform t.ok((select points from public.leaderboard_users_period(current_date - 1, current_date + 1) where user_id = u2) = 20, 'the period leaderboard sums kudos and quiz points of that period');
  perform t.ok((select count(*) from public.leaderboard_users_period(current_date + 10, current_date + 20) where points > 0) = 0, 'a period without activity has no points');
  perform t.ok(not exists (select 1 from public.leaderboard_users_period(current_date - 1, current_date + 1) where user_id = guest), 'guests are not on the leaderboard');
  perform t.as_user(u2);
  perform public.join_team(tid);
  perform t.ok((select points from public.leaderboard_teams_period(current_date - 1, current_date + 1) where team_id = tid) >= 20, 'a team sums the points of its members in the period');
end $test$;
