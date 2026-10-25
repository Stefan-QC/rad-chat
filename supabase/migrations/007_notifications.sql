-- Notifications (mentions, replies, direct messages) and per-channel read state for unread counters.

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('mention', 'reply', 'dm', 'task', 'kudos', 'poll', 'coffee', 'system')),
  actor_id uuid references public.profiles(id) on delete set null,
  channel_id uuid references public.channels(id) on delete cascade,
  message_id bigint references public.messages(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_actor_idx on public.notifications (actor_id);
create index notifications_channel_idx on public.notifications (channel_id);
create index notifications_message_idx on public.notifications (message_id);
alter table public.notifications enable row level security;
create policy "read own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.notifications from authenticated;

create function private.notify(p_user uuid, p_kind text, p_actor uuid, p_channel uuid, p_message bigint, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, actor_id, channel_id, message_id, title, body, link)
  select p_user, p_kind, p_actor, p_channel, p_message, p_title, p_body, p_link
  where p_user is distinct from p_actor;
$$;

-- Creates notifications for @mentions, replies in a thread and messages in direct or group conversations.
create function private.messages_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ch public.channels; actor_name text; preview text; link text; handle text; target uuid; root_author uuid; notified uuid[] := '{}';
begin
  if new.kind <> 'text' then return new; end if;
  select * into ch from public.channels where id = new.channel_id;
  select display_name into actor_name from public.profiles where id = new.user_id;
  preview := case when new.body = '' then 'Sent an attachment' else left(new.body, 140) end;
  link := '/channels/' || new.channel_id || case when new.parent_id is not null then '?thread=' || new.parent_id else '' end;

  for handle in select distinct lower(m[1]) from regexp_matches(new.body, '@([A-Za-z0-9_.-]{3,24})', 'g') as m loop
    select p.id into target from public.profiles p where p.username = handle and p.deactivated_at is null;
    if target is not null and target <> new.user_id and not (target = any(notified)) and private.user_can_access_channel(target, new.channel_id) then
      perform private.notify(target, 'mention', new.user_id, new.channel_id, new.id, actor_name || ' mentioned you', preview, link);
      notified := notified || target;
    end if;
  end loop;

  if new.parent_id is not null then
    select user_id into root_author from public.messages where id = new.parent_id;
    if root_author is not null and root_author <> new.user_id and not (root_author = any(notified)) then
      perform private.notify(root_author, 'reply', new.user_id, new.channel_id, new.id, actor_name || ' replied to your message', preview, link);
      notified := notified || root_author;
    end if;
  end if;

  if ch.kind in ('dm', 'group') then
    for target in select m.user_id from public.channel_members m where m.channel_id = ch.id and m.user_id <> new.user_id loop
      if not (target = any(notified)) then
        perform private.notify(target, 'dm', new.user_id, new.channel_id, new.id,
          case when ch.kind = 'group' then actor_name || ' in ' || ch.name else actor_name end, preview, link);
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function private.messages_notify();

create function public.mark_notifications_read(p_ids bigint[] default null) returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any(p_ids));
$$;

-- ---------- read state ----------
create table public.channel_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  last_read_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
create index channel_reads_channel_idx on public.channel_reads (channel_id);
alter table public.channel_reads enable row level security;
create policy "read own read state" on public.channel_reads for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.channel_reads from authenticated;

-- Remembers how far you have read in a channel and clears the notifications up to that message.
create function public.mark_channel_read(p_channel uuid, p_message bigint) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null or not private.can_access_channel(p_channel) then raise exception 'forbidden'; end if;
  insert into public.channel_reads (user_id, channel_id, last_read_id) values (me, p_channel, p_message)
  on conflict (user_id, channel_id) do update set last_read_id = greatest(public.channel_reads.last_read_id, excluded.last_read_id), updated_at = now();
  update public.notifications set read_at = now()
  where user_id = me and channel_id = p_channel and read_at is null and kind in ('mention', 'reply', 'dm') and message_id <= p_message;
end $$;

-- Unread top-level messages and unread mentions per channel, only counting messages from after you joined.
create function public.my_unread() returns table (channel_id uuid, unread int, mentions int)
language sql stable set search_path = '' as $$
  select c.id,
         (select count(*) from public.messages m
           where m.channel_id = c.id and m.parent_id is null and m.deleted_at is null and m.user_id <> (select auth.uid())
             and m.id > coalesce(r.last_read_id, 0)
             and m.created_at >= (select p.created_at from public.profiles p where p.id = (select auth.uid())))::int,
         (select count(*) from public.notifications n
           where n.user_id = (select auth.uid()) and n.channel_id = c.id and n.read_at is null and n.kind in ('mention', 'reply', 'dm'))::int
  from public.channels c
  left join public.channel_reads r on r.channel_id = c.id and r.user_id = (select auth.uid())
  where c.kind <> 'voice' and private.can_access_channel(c.id);
$$;

alter publication supabase_realtime add table public.notifications;

select private.lock_down_functions();
