-- Message features: threads, reactions, pins, image and GIF attachments, and a checked send_message().

-- ---------- messages ----------
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check check (char_length(body) <= 2000);
alter table public.messages
  add column parent_id bigint references public.messages(id) on delete cascade,
  add column kind text not null default 'text' check (kind in ('text', 'poll', 'system')),
  add column reply_count int not null default 0,
  add column last_reply_at timestamptz,
  add column attachment_count smallint not null default 0;
create index messages_parent_idx on public.messages (parent_id) where parent_id is not null;

create function private.messages_thread_counter() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.messages set reply_count = reply_count + 1, last_reply_at = new.created_at where id = new.parent_id;
  return new;
end $$;
create trigger messages_thread_counter after insert on public.messages
  for each row when (new.parent_id is not null) execute function private.messages_thread_counter();

create function private.can_access_message(mid bigint) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.messages m where m.id = mid and private.can_access_channel(m.channel_id));
$$;
grant execute on function private.can_access_message(bigint) to authenticated;

-- ---------- reactions ----------
create table public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16 and emoji !~ '[A-Za-z[:space:]]'),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index message_reactions_user_idx on public.message_reactions (user_id);
alter table public.message_reactions enable row level security;
create policy "reactions follow message access" on public.message_reactions for select to authenticated using (private.can_access_message(message_id));
revoke insert, update, delete on public.message_reactions from authenticated;

-- Adds the reaction, or removes it when you already reacted with this emoji. Returns true when it was added.
create function public.toggle_reaction(p_message bigint, p_emoji text) returns boolean language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null or not private.is_active() or not private.can_access_message(p_message) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.messages where id = p_message and deleted_at is null) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.message_reactions where message_id = p_message and user_id = me and emoji = p_emoji) then
    delete from public.message_reactions where message_id = p_message and user_id = me and emoji = p_emoji;
    return false;
  end if;
  if (select count(distinct emoji) from public.message_reactions where message_id = p_message) >= 20 then raise exception 'too_many_reactions'; end if;
  insert into public.message_reactions (message_id, user_id, emoji) values (p_message, me, p_emoji);
  return true;
end $$;

-- ---------- pins ----------
create table public.pinned_messages (
  message_id bigint primary key references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  pinned_by uuid references public.profiles(id) on delete set null,
  pinned_at timestamptz not null default now()
);
create index pinned_messages_channel_idx on public.pinned_messages (channel_id);
create index pinned_messages_by_idx on public.pinned_messages (pinned_by);
alter table public.pinned_messages enable row level security;
create policy "pins follow channel access" on public.pinned_messages for select to authenticated using (private.can_access_channel(channel_id));
revoke insert, update, delete on public.pinned_messages from authenticated;

create function public.pin_message(p_message bigint) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); m public.messages;
begin
  select * into m from public.messages where id = p_message and deleted_at is null;
  if m.id is null or not private.can_access_channel(m.channel_id) or not private.is_channel_moderator(m.channel_id) then raise exception 'forbidden'; end if;
  insert into public.pinned_messages (message_id, channel_id, pinned_by) values (p_message, m.channel_id, me) on conflict do nothing;
  perform private.audit(me, 'message.pin', 'message', p_message::text);
end $$;

create function public.unpin_message(p_message bigint) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); cid uuid;
begin
  select channel_id into cid from public.pinned_messages where message_id = p_message;
  if cid is null then return; end if;
  if not private.can_access_channel(cid) or not private.is_channel_moderator(cid) then raise exception 'forbidden'; end if;
  delete from public.pinned_messages where message_id = p_message;
  perform private.audit(me, 'message.unpin', 'message', p_message::text);
end $$;

-- ---------- attachments ----------
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id bigint not null references public.messages(id) on delete cascade,
  kind text not null check (kind in ('image', 'gif')),
  storage_path text,
  url text,
  mime text check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  width int check (width between 1 and 10000),
  height int check (height between 1 and 10000),
  size_bytes int check (size_bytes between 1 and 5242880),
  created_at timestamptz not null default now(),
  constraint attachment_shape check ((kind = 'image' and storage_path is not null and url is null) or (kind = 'gif' and url is not null and storage_path is null)),
  constraint gif_host check (url is null or url ~* '^https://([a-z0-9-]+\.)*(giphy\.com|klipy\.com|klipy\.co)/')
);
create index message_attachments_message_idx on public.message_attachments (message_id);
alter table public.message_attachments enable row level security;
create policy "attachments follow message access" on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and m.deleted_at is null and private.can_access_channel(m.channel_id)));
revoke insert, update, delete on public.message_attachments from authenticated;

-- Private bucket for pasted screenshots: path is <channel id>/<user id>/<uuid>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create function private.storage_channel(path text) returns uuid language sql immutable set search_path = '' as $$
  select case when (storage.foldername(path))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(path))[1])::uuid end;
$$;
grant execute on function private.storage_channel(text) to authenticated;

create policy "chat images readable with the channel" on storage.objects for select to authenticated
  using (bucket_id = 'chat-images' and private.can_access_channel(private.storage_channel(name)));
create policy "chat images uploadable by posters" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[2] = (select auth.uid())::text and private.can_post(private.storage_channel(name)));
create policy "chat images deletable by owner" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-images' and (storage.foldername(name))[2] = (select auth.uid())::text);

-- ---------- the one way to post a message ----------
drop policy "post as yourself where allowed" on public.messages;
revoke insert on public.messages from authenticated;

create function public.send_message(p_channel uuid, p_body text, p_parent bigint default null, p_attachments jsonb default '[]')
returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); msg public.messages; att jsonb; text_body text := trim(coalesce(p_body, ''));
  total int; att_kind text; att_path text; att_url text; att_mime text;
begin
  if me is null or not private.is_active() then raise exception 'not_authenticated'; end if;
  if not private.can_post(p_channel) then raise exception 'forbidden'; end if;
  if char_length(text_body) > 2000 then raise exception 'body_too_long'; end if;
  if jsonb_typeof(p_attachments) <> 'array' then raise exception 'invalid_attachments'; end if;
  total := jsonb_array_length(p_attachments);
  if total > 4 then raise exception 'too_many_attachments'; end if;
  if text_body = '' and total = 0 then raise exception 'empty_message'; end if;
  if p_parent is not null and not exists (
    select 1 from public.messages where id = p_parent and channel_id = p_channel and parent_id is null and deleted_at is null
  ) then raise exception 'invalid_parent'; end if;

  insert into public.messages (channel_id, user_id, body, parent_id, attachment_count)
  values (p_channel, me, text_body, p_parent, total) returning * into msg;

  for att in select * from jsonb_array_elements(p_attachments) loop
    att_kind := att ->> 'kind';
    att_mime := att ->> 'mime';
    if att_kind = 'image' then
      att_path := att ->> 'path';
      if att_path is null or att_path !~ ('^' || p_channel::text || '/' || me::text || '/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif)$') then
        raise exception 'invalid_attachments';
      end if;
      insert into public.message_attachments (message_id, kind, storage_path, mime, width, height, size_bytes)
      values (msg.id, 'image', att_path, att_mime, (att ->> 'width')::int, (att ->> 'height')::int, (att ->> 'size')::int);
    elsif att_kind = 'gif' then
      att_url := att ->> 'url';
      if att_url is null or att_url !~* '^https://([a-z0-9-]+\.)*(giphy\.com|klipy\.com|klipy\.co)/' then raise exception 'invalid_attachments'; end if;
      insert into public.message_attachments (message_id, kind, url, mime, width, height)
      values (msg.id, 'gif', att_url, 'image/gif', (att ->> 'width')::int, (att ->> 'height')::int);
    else
      raise exception 'invalid_attachments';
    end if;
  end loop;
  return msg;
end $$;

-- Moderators (and admins) can delete other people's messages too.
create or replace function public.delete_message(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); m public.messages;
begin
  select * into m from public.messages where id = p_id and deleted_at is null;
  if m.id is null or not private.can_access_channel(m.channel_id)
     or not (m.user_id = me or private.is_channel_moderator(m.channel_id)) then
    raise exception 'forbidden';
  end if;
  update public.messages set body = '[verwijderd]', deleted_at = now(), attachment_count = 0 where id = p_id;
  delete from public.pinned_messages where message_id = p_id;
  perform private.audit(me, 'message.delete', 'message', p_id::text, jsonb_build_object('author', m.user_id, 'body', m.body, 'channel', m.channel_id));
end $$;

alter publication supabase_realtime add table public.message_reactions, public.pinned_messages, public.message_attachments;

select private.lock_down_functions();
