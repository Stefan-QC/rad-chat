-- Message features: send_message rules, threads, reactions, pins, attachments and storage access.
do $test$
declare
  u1 uuid; u2 uuid; u3 uuid; gen uuid; ann uuid; priv uuid; msg public.messages; reply public.messages; other public.messages;
  img text; added boolean;
begin
  perform t.make_user('seed_admin');
  u1 := t.make_user('uone'); u2 := t.make_user('utwo'); u3 := t.make_user('uthree');
  select id into gen from public.channels where name = 'general' and team_id is null;
  select id into ann from public.channels where name = 'announcements';

  perform t.as_user(u1);
  priv := public.create_private_channel('plan', null, null, array[u2]);
  perform t.throws(format('select public.send_message(%L, %L)', ann, 'x'), 'forbidden', 'members cannot post in a moderators-only channel');
  perform t.throws(format('select public.send_message(%L, %L, %s)', gen, 'x', 99999), 'invalid_parent', 'a reply needs an existing parent message');
  perform t.throws(format('select public.send_message(%L, %L, %L)', gen, 'x', 'bad'), 'invalid', 'wrong argument types are rejected');

  -- threads
  msg := public.send_message(gen, 'root');
  perform t.as_user(u2);
  reply := public.send_message(gen, 'antwoord', msg.id);
  reply := public.send_message(gen, 'nog een antwoord', msg.id);
  perform t.as_user(u1);
  perform t.ok((select reply_count from public.messages where id = msg.id) = 2, 'replies increase the reply count of the root message');
  perform t.ok((select last_reply_at from public.messages where id = msg.id) is not null, 'the last reply time is stored');
  other := public.send_message(priv, 'andere draad');
  perform t.throws(format('select public.send_message(%L, %L, %s)', gen, 'x', other.id), 'invalid_parent', 'a reply cannot point at a message in another channel');
  perform t.throws(format('select public.send_message(%L, %L, %s)', gen, 'x', reply.id), 'invalid_parent', 'replies cannot be nested');

  -- reactions
  added := public.toggle_reaction(msg.id, '👍');
  perform t.ok(added, 'toggle_reaction adds a reaction');
  added := public.toggle_reaction(msg.id, '👍');
  perform t.ok(not added, 'toggling again removes it');
  perform public.toggle_reaction(msg.id, '🎉');
  perform t.throws(format('select public.toggle_reaction(%s, %L)', msg.id, 'abc'), 'violates check', 'letters are not valid reactions');
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.message_reactions) = 1, 'reactions are visible to colleagues');
  perform t.ok((select count(*) from public.message_reactions where message_id in (select id from public.messages where channel_id = priv)) = 0, 'reactions in a private channel stay hidden from outsiders');
  perform t.throws(format('select public.toggle_reaction(%s, %L)', other.id, '👍'), 'forbidden', 'outsiders cannot react in a private channel');

  -- pins
  perform t.as_user(u1);
  perform t.throws(format('select public.pin_message(%s)', msg.id), 'forbidden', 'a plain member cannot pin in a company channel');
  perform t.as_user(u1);
  perform public.pin_message((select id from public.messages where channel_id = priv limit 1));
  perform t.ok((select count(*) from public.pinned_messages) = 1, 'the owner of a private channel can pin a message');
  perform public.unpin_message((select message_id from public.pinned_messages limit 1));
  perform t.ok((select count(*) from public.pinned_messages) = 0, 'and unpin it again');

  -- attachments
  img := gen::text || '/' || u1::text || '/' || gen_random_uuid()::text || '.png';
  msg := public.send_message(gen, '', null, jsonb_build_array(jsonb_build_object('kind', 'image', 'path', img, 'mime', 'image/png', 'width', 800, 'height', 600, 'size', 12345)));
  perform t.ok(msg.attachment_count = 1 and (select count(*) from public.message_attachments where message_id = msg.id) = 1, 'an image-only message stores its attachment');
  perform t.throws(format('select public.send_message(%L, %L, null, %L::jsonb)', gen, '', jsonb_build_array(jsonb_build_object('kind', 'image', 'path', gen::text || '/' || u2::text || '/' || gen_random_uuid()::text || '.png', 'mime', 'image/png'))), 'invalid_attachments', 'cannot attach an image from somebody elses folder');
  perform t.throws(format('select public.send_message(%L, %L, null, %L::jsonb)', gen, 'x', jsonb_build_array(jsonb_build_object('kind', 'gif', 'url', 'https://evil.example.com/a.gif'))), 'invalid_attachments', 'a GIF from an unknown host is rejected');
  perform t.throws(format('select public.send_message(%L, %L, null, %L::jsonb)', gen, 'x', jsonb_build_array(jsonb_build_object('kind', 'gif', 'url', 'http://media.giphy.com/a.gif'))), 'invalid_attachments', 'a GIF must use https');
  msg := public.send_message(gen, 'kijk', null, jsonb_build_array(jsonb_build_object('kind', 'gif', 'url', 'https://media.giphy.com/media/abc/giphy.gif', 'width', 480, 'height', 270)));
  perform t.ok((select kind from public.message_attachments where message_id = msg.id) = 'gif', 'a GIF from an allowed host is stored');
  perform t.throws(format('select public.send_message(%L, %L, null, %L::jsonb)', gen, 'x', jsonb_build_array(1, 2, 3, 4, 5)), 'too_many_attachments', 'at most four attachments per message');

  -- screenshots in storage
  perform t.ok(private.storage_channel(img) = gen, 'the channel is read from the storage path');
  insert into storage.objects (bucket_id, name, owner) values ('chat-images', img, u1);
  perform t.ok(true, 'a member can upload into their own folder of a channel they can post in');
  perform t.throws(format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)', 'chat-images', gen::text || '/' || u2::text || '/x.png', u1), 'row-level security', 'cannot upload into somebody elses folder');
  perform t.throws(format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)', 'chat-images', ann::text || '/' || u1::text || '/x.png', u1), 'row-level security', 'cannot upload where posting is not allowed');
  perform t.as_user(u3);
  perform t.ok((select count(*) from storage.objects where bucket_id = 'chat-images') = 1, 'colleagues can read images of channels they can access');
  perform t.as_user(u1);
  perform t.as_owner();
  perform t.as_user(u2);
  perform t.ok((select count(*) from storage.objects where bucket_id = 'chat-images' and private.can_access_channel(private.storage_channel(name))) = 1, 'a private channel member can read its images');

  -- delete by a moderator hides attachments
  perform t.as_user(u1);
  msg := public.send_message(priv, 'weg ermee', null, '[]');
  perform t.as_user(u2);
  perform t.throws(format('select public.delete_message(%s)', msg.id), 'forbidden', 'a plain member cannot delete other peoples messages');
  perform t.as_user(u1);
  perform public.delete_message(msg.id);
  perform t.ok((select deleted_at is not null and body = '[verwijderd]' from public.messages where id = msg.id), 'the owner of a private channel can delete a message');
end $test$;
