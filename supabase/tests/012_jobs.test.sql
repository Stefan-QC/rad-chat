-- Background jobs: access rules and behaviour of the four jobs_* functions.
do $test$
declare
  admin_id uuid; u1 uuid; u2 uuid; u3 uuid; u4 uuid; guest uuid; gen uuid; ann uuid; result jsonb; first_round jsonb; msg public.messages;
begin
  admin_id := t.make_user('seed_admin');
  u1 := t.make_user('uone'); u2 := t.make_user('utwo'); u3 := t.make_user('uthree'); u4 := t.make_user('ufour');
  guest := t.make_user('guest', 'guest');
  select id into gen from public.channels where name = 'general' and team_id is null;
  select id into ann from public.channels where name = 'announcements' and team_id is null;

  -- access: only the service role may run jobs
  perform t.as_user(u1);
  perform t.throws('select public.jobs_expire_guests()', 'permission denied', 'a signed-in user cannot expire guests');
  perform t.throws('select public.jobs_purge_messages()', 'permission denied', 'a signed-in user cannot purge messages');
  perform t.throws('select public.jobs_post_celebrations()', 'permission denied', 'a signed-in user cannot post celebrations');
  perform t.throws('select public.jobs_run_coffee_round()', 'permission denied', 'a signed-in user cannot start a coffee round');

  -- expire guests
  perform t.as_owner();
  update public.profiles set expires_at = now() - interval '1 day' where id = guest;
  perform t.as_service();
  result := public.jobs_expire_guests();
  perform t.ok((result ->> 'expired')::int = 1 and result -> 'user_ids' ->> 0 = guest::text, 'an expired guest is deactivated');
  perform t.ok((public.jobs_expire_guests() ->> 'expired')::int = 0, 'running it again changes nothing');

  -- purge messages
  perform t.as_owner();
  msg := null;
  insert into public.messages (channel_id, user_id, body, created_at) values (gen, u1, 'heel oud bericht', now() - interval '400 days');
  insert into public.messages (channel_id, user_id, body) values (gen, u1, 'vers bericht');
  perform t.as_service();
  result := public.jobs_purge_messages();
  perform t.ok((result ->> 'deleted')::int = 0 and (result ->> 'days')::int = 0, 'nothing is deleted while no retention is set');
  perform t.as_owner();
  insert into public.app_settings (key, value) values ('message_retention_days', '365');
  perform t.as_service();
  result := public.jobs_purge_messages();
  perform t.ok((result ->> 'deleted')::int = 1 and (result ->> 'days')::int = 365, 'messages older than the retention are deleted');
  perform t.as_owner();
  perform t.ok((select count(*) from public.messages where body = 'vers bericht') = 1 and (select count(*) from public.messages where body = 'heel oud bericht') = 0, 'recent messages stay');

  -- celebrations
  update public.profiles set birth_month = extract(month from current_date)::int, birth_day = extract(day from current_date)::int where id = u2;
  update public.profiles set start_date = (current_date - interval '3 years')::date where id = u3;
  perform t.as_service();
  result := public.jobs_post_celebrations();
  perform t.ok((result ->> 'posted')::int = 2, 'a birthday and an anniversary are announced');
  perform t.as_owner();
  perform t.ok((select count(*) from public.messages where channel_id = ann and body like '%@utwo%') = 1 and (select count(*) from public.messages where channel_id = ann and body like '%3 years%') = 1, 'the announcements mention the people');
  perform t.ok((select count(*) from public.notifications where user_id = u2 and kind = 'mention') = 1, 'the celebrated person gets a notification');
  perform t.as_service();
  perform t.ok((public.jobs_post_celebrations() ->> 'posted')::int = 0, 'the same celebration is never announced twice');

  -- coffee round
  perform t.as_owner();
  update public.profiles set coffee_opt_in = true where id in (u1, u2, u3, u4, guest);
  perform t.as_service();
  first_round := public.jobs_run_coffee_round();
  perform t.ok((first_round ->> 'pairs')::int = 2 and (first_round ->> 'unpaired')::int = 0, 'four opted-in colleagues make two pairs, guests are left out');
  perform t.ok((public.jobs_run_coffee_round() ->> 'skipped') = 'already_ran_today', 'a second round on the same day is skipped');
  perform t.as_owner();
  perform t.ok((select count(*) from public.notifications where kind = 'coffee') = 4, 'everybody in a pair is notified');
  perform t.ok((select count(*) from public.coffee_pairs where channel_id is not null) = 2, 'every pair gets a direct message conversation');
  perform t.ok(not exists (select 1 from public.coffee_pairs where user_a = guest or user_b = guest), 'a guest is never paired');
  perform t.as_user(u1);
  perform t.ok((select count(*) from public.coffee_pairs) = 1, 'you only see your own coffee pair');

  -- the public celebrations list still works through the shared rules
  perform t.ok((select count(*) from public.upcoming_celebrations(0)) >= 2, 'upcoming_celebrations still lists todays celebrations');
end $test$;
