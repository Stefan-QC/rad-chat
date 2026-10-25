-- Access model: guests and deactivated accounts, private channels, direct messages, group chats, roles per team and per channel.

-- ---------- accounts: guests, expiry, deactivation ----------
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('member', 'admin', 'guest'));
alter table public.profiles add column expires_at timestamptz, add column deactivated_at timestamptz;

create or replace function private.is_active() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.deactivated_at is null and (p.expires_at is null or p.expires_at > now())
                   from public.profiles p where p.id = (select auth.uid())), false);
$$;

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'admin' and p.deactivated_at is null from public.profiles p where p.id = (select auth.uid())), false);
$$;

create function private.is_guest() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'guest' from public.profiles p where p.id = (select auth.uid())), false);
$$;
grant execute on function private.is_active(), private.is_guest() to authenticated;

-- ---------- team roles ----------
alter table public.team_members drop constraint team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('owner', 'moderator', 'member'));

-- ---------- channels: private, direct, group, post policy ----------
alter table public.channels drop constraint channels_kind_check;
alter table public.channels add constraint channels_kind_check check (kind in ('text', 'voice', 'dm', 'group'));
alter table public.channels
  add column is_private boolean not null default false,
  add column post_policy text not null default 'everyone' check (post_policy in ('everyone', 'moderators')),
  add column created_by uuid references public.profiles(id) on delete set null;
create index channels_created_by_idx on public.channels (created_by);
update public.channels set post_policy = 'moderators' where name = 'announcements' and team_id is null;

create table public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'moderator', 'member', 'readonly')),
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index channel_members_user_idx on public.channel_members (user_id);
alter table public.channel_members enable row level security;
revoke insert, update, delete on public.channel_members from authenticated;

-- ---------- access checks ----------
create function private.user_can_access_channel(uid uuid, cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.channels c
    join public.profiles p on p.id = uid and p.deactivated_at is null and (p.expires_at is null or p.expires_at > now())
    where c.id = cid and (
      case
        when c.is_private then exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = uid)
        when c.team_id is not null then exists (select 1 from public.team_members t where t.team_id = c.team_id and t.user_id = uid)
        else p.role <> 'guest'
      end));
$$;

create or replace function private.can_access_channel(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.user_can_access_channel((select auth.uid()), cid);
$$;

create function private.is_channel_moderator(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin()
    or exists (select 1 from public.channel_members m where m.channel_id = cid and m.user_id = (select auth.uid()) and m.role in ('owner', 'moderator'))
    or exists (select 1 from public.channels c join public.team_members t on t.team_id = c.team_id
               where c.id = cid and t.user_id = (select auth.uid()) and t.role in ('owner', 'moderator'));
$$;

create function private.can_post(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_access_channel(cid)
    and exists (select 1 from public.channels c where c.id = cid and c.kind in ('text', 'dm', 'group')
                and (c.post_policy = 'everyone' or private.is_channel_moderator(cid)))
    and coalesce((select m.role from public.channel_members m where m.channel_id = cid and m.user_id = (select auth.uid())), 'member') <> 'readonly';
$$;
grant execute on function private.user_can_access_channel(uuid, uuid), private.is_channel_moderator(uuid), private.can_post(uuid) to authenticated;

create policy "members visible with the channel" on public.channel_members for select to authenticated using (private.can_access_channel(channel_id));

drop policy "post as yourself in accessible text channels" on public.messages;
create policy "post as yourself where allowed" on public.messages for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_post(channel_id));

-- ---------- private channels, direct messages and groups ----------
create function public.start_dm(p_user uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); cid uuid;
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if p_user = me then raise exception 'invalid_user'; end if;
  if not exists (select 1 from public.profiles where id = p_user and deactivated_at is null) then raise exception 'invalid_user'; end if;
  select c.id into cid from public.channels c
  where c.kind = 'dm'
    and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = me)
    and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = p_user)
  limit 1;
  if cid is null then
    insert into public.channels (name, kind, is_private, created_by)
    values ('dm-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'dm', true, me) returning id into cid;
    insert into public.channel_members (channel_id, user_id) values (cid, me), (cid, p_user);
  end if;
  return cid;
end $$;

create function public.create_group(p_name text, p_members uuid[]) returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); cid uuid; others uuid[];
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  select coalesce(array_agg(distinct u), '{}') into others from unnest(p_members) u where u <> me;
  if coalesce(array_length(others, 1), 0) < 1 or array_length(others, 1) > 19 then raise exception 'invalid_members'; end if;
  if exists (select 1 from unnest(others) u where not exists (select 1 from public.profiles p where p.id = u and p.deactivated_at is null)) then
    raise exception 'invalid_members';
  end if;
  if exists (select 1 from public.profiles p where p.id = any(others) and p.role = 'guest') and not private.is_admin() then raise exception 'forbidden'; end if;
  insert into public.channels (name, kind, is_private, created_by) values (left(trim(p_name), 40), 'group', true, me) returning id into cid;
  insert into public.channel_members (channel_id, user_id, role) values (cid, me, 'owner');
  insert into public.channel_members (channel_id, user_id) select cid, u from unnest(others) u;
  perform private.audit(me, 'channel.create_group', 'channel', cid::text, jsonb_build_object('members', array_length(others, 1) + 1));
  return cid;
end $$;

create function public.create_private_channel(p_name text, p_topic text default null, p_team uuid default null, p_members uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); cid uuid; others uuid[];
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if p_team is not null and not exists (select 1 from public.team_members where team_id = p_team and user_id = me) then raise exception 'forbidden'; end if;
  select coalesce(array_agg(distinct u), '{}') into others from unnest(p_members) u where u <> me;
  if coalesce(array_length(others, 1), 0) > 49 then raise exception 'invalid_members'; end if;
  if exists (select 1 from public.profiles p where p.id = any(others) and (p.deactivated_at is not null or (p.role = 'guest' and not private.is_admin()))) then
    raise exception 'invalid_members';
  end if;
  insert into public.channels (name, kind, is_private, team_id, topic, created_by)
  values (regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'), 'text', true, p_team, p_topic, me) returning id into cid;
  insert into public.channel_members (channel_id, user_id, role) values (cid, me, 'owner');
  insert into public.channel_members (channel_id, user_id) select cid, u from unnest(others) u;
  perform private.audit(me, 'channel.create_private', 'channel', cid::text, jsonb_build_object('name', p_name));
  return cid;
end $$;

create function public.add_channel_member(p_channel uuid, p_user uuid, p_role text default 'member') returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c public.channels;
begin
  select * into c from public.channels where id = p_channel;
  if c.id is null or not c.is_private or c.kind = 'dm' or not private.can_access_channel(p_channel) or not private.is_channel_moderator(p_channel) then
    raise exception 'forbidden';
  end if;
  if p_role not in ('moderator', 'member', 'readonly') then raise exception 'invalid_role'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and p.deactivated_at is null) then raise exception 'invalid_user'; end if;
  if exists (select 1 from public.profiles p where p.id = p_user and p.role = 'guest') and not private.is_admin() then raise exception 'forbidden'; end if;
  insert into public.channel_members (channel_id, user_id, role) values (p_channel, p_user, p_role) on conflict do nothing;
  perform private.audit(me, 'channel.member_add', 'channel', p_channel::text, jsonb_build_object('user', p_user, 'role', p_role));
end $$;

create function public.remove_channel_member(p_channel uuid, p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c public.channels;
begin
  select * into c from public.channels where id = p_channel;
  if c.id is null or not c.is_private or c.kind = 'dm' or not private.can_access_channel(p_channel) or not private.is_channel_moderator(p_channel) then
    raise exception 'forbidden';
  end if;
  if p_user = me then raise exception 'use_leave_channel'; end if;
  delete from public.channel_members where channel_id = p_channel and user_id = p_user;
  perform private.audit(me, 'channel.member_remove', 'channel', p_channel::text, jsonb_build_object('user', p_user));
end $$;

create function public.leave_channel(p_channel uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c public.channels; was_owner boolean; successor uuid;
begin
  select * into c from public.channels where id = p_channel;
  if c.id is null or not c.is_private or c.kind = 'dm' then raise exception 'forbidden'; end if;
  select role = 'owner' into was_owner from public.channel_members where channel_id = p_channel and user_id = me;
  if was_owner is null then return; end if;
  delete from public.channel_members where channel_id = p_channel and user_id = me;
  if not exists (select 1 from public.channel_members where channel_id = p_channel) then
    delete from public.channels where id = p_channel;
  elsif was_owner and not exists (select 1 from public.channel_members where channel_id = p_channel and role = 'owner') then
    select user_id into successor from public.channel_members where channel_id = p_channel order by joined_at limit 1;
    update public.channel_members set role = 'owner' where channel_id = p_channel and user_id = successor;
  end if;
end $$;

create function public.set_channel_member_role(p_channel uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); c public.channels;
begin
  select * into c from public.channels where id = p_channel;
  if c.id is null or c.kind = 'dm' or not (private.is_admin() or exists (select 1 from public.channel_members where channel_id = p_channel and user_id = me and role = 'owner')) then
    raise exception 'forbidden';
  end if;
  if p_role not in ('owner', 'moderator', 'member', 'readonly') then raise exception 'invalid_role'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and p.deactivated_at is null) then raise exception 'invalid_user'; end if;
  insert into public.channel_members (channel_id, user_id, role) values (p_channel, p_user, p_role)
  on conflict (channel_id, user_id) do update set role = excluded.role;
  perform private.audit(me, 'channel.role', 'channel', p_channel::text, jsonb_build_object('user', p_user, 'role', p_role));
end $$;

create function public.set_channel_post_policy(p_channel uuid, p_policy text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if p_policy not in ('everyone', 'moderators') then raise exception 'invalid_policy'; end if;
  if not (private.is_admin() or exists (select 1 from public.channel_members where channel_id = p_channel and user_id = me and role = 'owner')) then
    raise exception 'forbidden';
  end if;
  update public.channels set post_policy = p_policy where id = p_channel and kind in ('text', 'group');
  perform private.audit(me, 'channel.policy', 'channel', p_channel::text, jsonb_build_object('policy', p_policy));
end $$;

-- ---------- team roles ----------
create function public.set_team_member_role(p_team uuid, p_user uuid, p_role text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if p_role not in ('owner', 'moderator', 'member') then raise exception 'invalid_role'; end if;
  if not (private.is_admin() or exists (select 1 from public.team_members where team_id = p_team and user_id = me and role = 'owner')) then
    raise exception 'forbidden';
  end if;
  update public.team_members set role = p_role where team_id = p_team and user_id = p_user;
  perform private.audit(me, 'team.role', 'team', p_team::text, jsonb_build_object('user', p_user, 'role', p_role));
end $$;

create or replace function public.remove_team_member(p_team uuid, p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); my_role text; target_role text;
begin
  select role into my_role from public.team_members where team_id = p_team and user_id = me;
  select role into target_role from public.team_members where team_id = p_team and user_id = p_user;
  if not (private.is_admin() or coalesce(my_role = 'owner', false) or coalesce(my_role = 'moderator' and target_role = 'member', false)) then
    raise exception 'forbidden';
  end if;
  if p_user = me then raise exception 'use_leave_team'; end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  perform private.audit(me, 'team.remove_member', 'team', p_team::text, jsonb_build_object('user', p_user));
end $$;

create or replace function public.join_team(p_team uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  insert into public.team_members (team_id, user_id) values (p_team, me) on conflict do nothing;
  perform private.audit(me, 'team.join', 'team', p_team::text);
end $$;

create or replace function public.create_team(p_name text, p_description text default null, p_color text default '#D71920') returns uuid
language plpgsql security definer set search_path = '' as $$
declare tid uuid; me uuid := (select auth.uid());
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  insert into public.teams (name, description, color, created_by) values (trim(p_name), p_description, p_color, me) returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, me, 'owner');
  insert into public.channels (name, kind, team_id, topic, created_by) values
    ('general', 'text', tid, 'Kanaal van team ' || trim(p_name), me),
    ('Voice', 'voice', tid, null, me);
  perform private.audit(me, 'team.create', 'team', tid::text, jsonb_build_object('name', trim(p_name)));
  return tid;
end $$;

alter publication supabase_realtime add table public.channel_members;

select private.lock_down_functions();
