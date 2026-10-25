-- Typing indicators: the broadcast topic follows channel access, voice keeps working and unknown topics stay closed.
do $test$
declare u1 uuid; u2 uuid; u3 uuid; gen uuid; dm uuid;
begin
  perform t.make_user('seed_admin'); -- the first account is always an admin, so use it up
  u1 := t.make_user('uone'); u2 := t.make_user('utwo'); u3 := t.make_user('uthree');
  select id into gen from public.channels where name = 'general' and team_id is null;
  execute 'grant select, insert on realtime.messages to authenticated';

  perform t.as_user(u1);
  dm := public.start_dm(u2);

  perform set_config('realtime.topic', 'typing:' || gen, true);
  insert into realtime.messages (topic, extension) values ('typing:' || gen, 'broadcast');
  perform t.ok(true, 'a member can send typing events in a company channel');
  perform t.ok((select count(*) from realtime.messages where topic = 'typing:' || gen) = 1, 'a member can receive typing events in a company channel');

  perform set_config('realtime.topic', 'typing:' || dm, true);
  insert into realtime.messages (topic, extension) values ('typing:' || dm, 'broadcast');
  perform t.ok(true, 'a DM participant can send typing events in the DM');

  perform set_config('realtime.topic', 'voice:' || gen, true);
  insert into realtime.messages (topic, extension) values ('voice:' || gen, 'presence');
  perform t.ok(true, 'voice topics still work');

  perform t.as_user(u3);
  perform set_config('realtime.topic', 'typing:' || dm, true);
  perform t.throws(format('insert into realtime.messages (topic, extension) values (%L, %L)', 'typing:' || dm, 'broadcast'), 'row-level security', 'an outsider cannot send typing events in someone elses DM');
  perform t.ok((select count(*) from realtime.messages where topic = 'typing:' || dm) = 0, 'an outsider cannot receive typing events from a DM');

  perform set_config('realtime.topic', 'typing:not-a-uuid', true);
  perform t.throws(format('insert into realtime.messages (topic, extension) values (%L, %L)', 'typing:not-a-uuid', 'broadcast'), 'row-level security', 'malformed typing topics are refused');
  perform set_config('realtime.topic', 'something-else', true);
  perform t.throws(format('insert into realtime.messages (topic, extension) values (%L, %L)', 'something-else', 'broadcast'), 'row-level security', 'unknown topics stay closed');
end
$test$;
