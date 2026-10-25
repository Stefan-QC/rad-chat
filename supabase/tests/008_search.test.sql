-- Message search: prefix matching, safe input and access rules.
do $test$
declare
  u1 uuid; u2 uuid; u3 uuid; gen uuid; priv uuid; found int;
begin
  perform t.make_user('seed_admin');
  u1 := t.make_user('uone'); u2 := t.make_user('utwo'); u3 := t.make_user('uthree');
  select id into gen from public.channels where name = 'general' and team_id is null;

  perform t.as_user(u1);
  priv := public.create_private_channel('geheim', null, null, array[u2]);
  perform public.send_message(gen, 'Het kwartaal rapport staat klaar');
  perform public.send_message(gen, 'Lunch om twaalf uur?');
  perform public.send_message(priv, 'Geheim rapport voor het management');
  perform public.send_message(gen, 'verwijder dit rapport');
  perform t.as_owner();
  update public.messages set deleted_at = now() where body like 'verwijder%';

  perform t.as_user(u1);
  perform t.ok((select count(*) from public.search_messages('rapp')) = 2, 'a prefix finds the matching messages in readable channels');
  perform t.ok((select count(*) from public.search_messages('RAPPORT')) = 2, 'search ignores case');
  perform t.ok((select count(*) from public.search_messages('kwartaal rapport')) = 1, 'several words must all match');
  perform t.ok((select count(*) from public.search_messages('rapport', priv)) = 1, 'a channel filter narrows the results');
  perform t.ok((select count(*) from public.search_messages('lunch')) = 1, 'other messages are found too');
  perform t.ok((select count(*) from public.search_messages('verwijder')) = 0, 'deleted messages are never returned');
  perform t.ok((select count(*) from public.search_messages('')) = 0 and (select count(*) from public.search_messages('!!! ...')) = 0, 'empty or symbol-only queries return nothing');
  perform t.ok((select count(*) from public.search_messages('rapport''; drop table messages; --')) = 0, 'quotes and SQL in the query are harmless');
  perform t.ok((select count(*) from public.search_messages('rapport', null, 1)) = 1, 'the limit is respected');

  perform t.as_user(u3);
  perform t.ok((select count(*) from public.search_messages('rapport')) = 1, 'outsiders do not find messages from private channels');
  perform t.ok((select count(*) from public.search_messages('geheim')) = 0, 'private text is not searchable for outsiders');

  perform t.as_user(u2);
  perform t.ok((select count(*) from public.search_messages('rapport')) = 2, 'members of the private channel find its messages');
end $test$;
