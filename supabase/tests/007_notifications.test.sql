-- Notifications for mentions, replies and direct messages, plus unread counters.
do $test$
declare
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; gen uuid; dm uuid; priv uuid; root public.messages; reply public.messages; m1 public.messages; m2 public.messages;
begin
  perform t.make_user('seed_admin');
  u1 := t.make_user('uone'); u2 := t.make_user('utwo'); u3 := t.make_user('uthree'); u4 := t.make_user('ufour');
  select id into gen from public.channels where name = 'general' and team_id is null;

  -- mentions
  perform t.as_user(u1);
  priv := public.create_private_channel('geheim', null, null, array[u2]);
  perform public.send_message(gen, 'hoi @utwo en @UTHREE en @uone en @nobody');
  perform public.send_message(priv, 'privé voor @utwo en @uthree');
  perform t.as_owner();
  perform t.ok((select count(*) from public.notifications where user_id = u2 and kind = 'mention') = 2, 'a mentioned colleague gets a notification per message');
  perform t.ok((select count(*) from public.notifications where user_id = u3 and kind = 'mention') = 1, 'mentions are case-insensitive');
  perform t.ok((select count(*) from public.notifications where user_id = u3 and channel_id = priv) = 0, 'no notification for someone who cannot see the private channel');
  perform t.ok((select count(*) from public.notifications where user_id = u1 and kind in ('mention', 'reply', 'dm')) = 0, 'you are never notified about your own mention');

  -- replies
  perform t.as_user(u2);
  root := public.send_message(gen, 'een vraag');
  perform t.as_user(u3);
  reply := public.send_message(gen, 'het antwoord', root.id);
  perform t.as_owner();
  perform t.ok((select count(*) from public.notifications where user_id = u2 and kind = 'reply' and message_id = reply.id) = 1, 'the author of the root message is told about a reply');
  perform t.as_user(u2);
  reply := public.send_message(gen, 'bedankt @uthree', root.id);
  perform t.as_owner();
  perform t.ok((select count(*) from public.notifications where user_id = u3 and message_id = reply.id and kind = 'mention') = 1
               and (select count(*) from public.notifications where user_id = u3 and message_id = reply.id) = 1, 'a mention inside a reply is not notified twice');

  -- direct messages and groups
  perform t.as_user(u1);
  dm := public.start_dm(u4);
  perform public.send_message(dm, 'hallo vier');
  perform t.as_owner();
  perform t.ok((select count(*) from public.notifications where user_id = u4 and kind = 'dm' and channel_id = dm) = 1, 'the other person of a DM is notified');
  perform t.ok((select title from public.notifications where user_id = u4 and kind = 'dm') = 'uone', 'the DM notification is titled with the sender');

  -- visibility of notifications
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.notifications) = (select count(*) from public.notifications where user_id = u3), 'you only see your own notifications');
  perform t.throws('update public.notifications set read_at = now()', 'permission denied', 'notifications cannot be edited directly');

  -- unread counters and read state
  perform t.as_user(u4);
  perform t.ok((select unread from public.my_unread() where channel_id = dm) = 1, 'one unread message in the DM');
  perform t.ok((select mentions from public.my_unread() where channel_id = dm) = 1, 'the DM counts as one unread notification');
  perform t.as_user(u1);
  m1 := public.send_message(gen, 'nieuw bericht 1');
  m2 := public.send_message(gen, 'nieuw bericht 2');
  perform t.as_user(u4);
  perform t.ok((select unread from public.my_unread() where channel_id = gen) >= 2, 'new messages in a channel count as unread');
  perform public.mark_channel_read(gen, m2.id);
  perform t.ok((select unread from public.my_unread() where channel_id = gen) = 0, 'marking a channel as read clears its unread count');
  perform public.mark_channel_read(dm, (select max(id) from public.messages where channel_id = dm));
  perform t.ok((select mentions from public.my_unread() where channel_id = dm) = 0, 'reading a DM clears its notifications');
  perform t.ok((select count(*) from public.my_unread() where channel_id = priv) = 0, 'channels you cannot access are not listed');
  perform t.throws(format('select public.mark_channel_read(%L, 1)', priv), 'forbidden', 'cannot mark a channel you cannot access');

  -- mark everything read
  perform t.as_user(u2);
  perform t.ok((select count(*) from public.notifications where read_at is null) > 0, 'u2 has unread notifications');
  perform public.mark_notifications_read();
  perform t.ok((select count(*) from public.notifications where read_at is null) = 0, 'mark_notifications_read clears them all');
end $test$;
