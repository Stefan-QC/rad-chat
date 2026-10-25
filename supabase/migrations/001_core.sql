-- RAD Chat core: accounts/profiles, teams, channels, messages, audit log. RLS on everything.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public;

-- ---------- settings ----------
create table public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security; -- no policies: only server-side functions read it
insert into public.app_settings values ('allowed_email_domain', 'qualogy.com');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.-]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  job_title text check (char_length(job_title) <= 60),
  bio text check (char_length(bio) <= 280),
  avatar_color text not null default '#D71920' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles readable by signed-in users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Only these columns can be edited directly; the role changes through set_user_role().
revoke update on public.profiles from authenticated;
grant update (display_name, job_title, bio, avatar_color) on public.profiles to authenticated;

create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
grant execute on function private.is_admin() to authenticated;

-- ---------- audit log ----------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
alter table public.audit_logs enable row level security;
create policy "admins read audit log" on public.audit_logs for select to authenticated using (private.is_admin());
revoke insert, update, delete on public.audit_logs from authenticated;

create function private.audit(p_actor uuid, p_action text, p_type text default null, p_id text default null, p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor, p_action, p_type, p_id, coalesce(p_meta, '{}'));
$$;

-- ---------- sign-up: domain check + profile ----------
create function private.enforce_email_domain() returns trigger language plpgsql security definer set search_path = '' as $$
declare dom text;
begin
  select value into dom from public.app_settings where key = 'allowed_email_domain';
  if dom is not null and dom <> '' and lower(split_part(new.email, '@', 2)) <> lower(dom) then
    raise exception 'Alleen e-mailadressen van @% mogen zich registreren.', dom;
  end if;
  return new;
end $$;
create trigger enforce_email_domain before insert on auth.users for each row execute function private.enforce_email_domain();

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base text; uname text; n int := 0; first_user boolean;
  palette text[] := array['#D71920','#822727','#1b1b1b','#E53E3E','#63171B','#4a4a4a','#9B2C2C','#F56565'];
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), '[^a-zA-Z0-9_.-]', '', 'g'));
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 20);
  uname := base;
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1; uname := base || n::text;
  end loop;
  select not exists (select 1 from public.profiles) into first_user; -- the first account becomes admin
  insert into public.profiles (id, username, display_name, avatar_color, role)
  values (new.id, uname,
          left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), uname), 40),
          palette[1 + abs(hashtext(new.id::text)) % 8],
          case when first_user then 'admin' else 'member' end);
  perform private.audit(new.id, 'auth.signup', 'profile', new.id::text, jsonb_build_object('username', uname));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.profile_changed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if (new.display_name, new.job_title, new.bio, new.avatar_color) is distinct from (old.display_name, old.job_title, old.bio, old.avatar_color) then
    perform private.audit((select auth.uid()), 'profile.update', 'profile', new.id::text,
      jsonb_build_object('display_name', new.display_name, 'job_title', new.job_title));
  end if;
  return new;
end $$;
create trigger profile_changed before update on public.profiles for each row execute function private.profile_changed();

create function public.set_user_role(p_user uuid, p_role text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden'; end if;
  if p_role not in ('member', 'admin') then raise exception 'invalid_role'; end if;
  if p_user = (select auth.uid()) and p_role <> 'admin' then raise exception 'cannot_demote_self'; end if;
  update public.profiles set role = p_role where id = p_user;
  perform private.audit((select auth.uid()), 'profile.role_change', 'profile', p_user::text, jsonb_build_object('role', p_role));
end $$;

create function public.log_login() returns void language sql security definer set search_path = '' as $$
  select private.audit((select auth.uid()), 'auth.login', 'profile', (select auth.uid())::text);
$$;

-- ---------- teams ----------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  description text check (char_length(description) <= 280),
  color text not null default '#D71920' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index teams_name_idx on public.teams (lower(name));
create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
create policy "teams readable" on public.teams for select to authenticated using (true);
create policy "team members readable" on public.team_members for select to authenticated using (true);
revoke insert, update, delete on public.teams, public.team_members from authenticated; -- writes go through the functions below

-- ---------- channels ----------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('text', 'voice')),
  team_id uuid references public.teams(id) on delete cascade, -- null = company-wide
  topic text check (char_length(topic) <= 200),
  created_at timestamptz not null default now()
);
create unique index channels_unique_idx on public.channels (coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(name));
alter table public.channels enable row level security;

create function private.can_access_channel(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and (c.team_id is null or exists (
      select 1 from public.team_members tm where tm.team_id = c.team_id and tm.user_id = (select auth.uid())))
  );
$$;
grant execute on function private.can_access_channel(uuid) to authenticated;

create policy "channels visible to members" on public.channels for select to authenticated using (private.can_access_channel(id));
revoke insert, update, delete on public.channels from authenticated;

create function public.create_channel(p_name text, p_kind text, p_topic text default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if not private.is_admin() then raise exception 'forbidden'; end if;
  insert into public.channels (name, kind, topic)
  values (regexp_replace(lower(trim(p_name)), '\s+', '-', 'g'), p_kind, p_topic) returning id into cid;
  perform private.audit((select auth.uid()), 'channel.create', 'channel', cid::text, jsonb_build_object('name', p_name, 'kind', p_kind));
  return cid;
end $$;

-- ---------- team functions ----------
create function public.create_team(p_name text, p_description text default null, p_color text default '#D71920') returns uuid
language plpgsql security definer set search_path = '' as $$
declare tid uuid; me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_authenticated'; end if;
  insert into public.teams (name, description, color, created_by) values (trim(p_name), p_description, p_color, me) returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, me, 'owner');
  insert into public.channels (name, kind, team_id, topic) values
    ('general', 'text', tid, 'Kanaal van team ' || trim(p_name)),
    ('Voice', 'voice', tid, null);
  perform private.audit(me, 'team.create', 'team', tid::text, jsonb_build_object('name', trim(p_name)));
  return tid;
end $$;

create function public.update_team(p_team uuid, p_name text, p_description text, p_color text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if not (private.is_admin() or exists (select 1 from public.team_members where team_id = p_team and user_id = me and role = 'owner')) then
    raise exception 'forbidden';
  end if;
  update public.teams set name = trim(p_name), description = p_description, color = p_color where id = p_team;
  perform private.audit(me, 'team.update', 'team', p_team::text, jsonb_build_object('name', trim(p_name)));
end $$;

create function public.join_team(p_team uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_authenticated'; end if;
  insert into public.team_members (team_id, user_id) values (p_team, me) on conflict do nothing;
  perform private.audit(me, 'team.join', 'team', p_team::text);
end $$;

create function public.leave_team(p_team uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); was_owner boolean; successor uuid;
begin
  select role = 'owner' into was_owner from public.team_members where team_id = p_team and user_id = me;
  if was_owner is null then return; end if;
  delete from public.team_members where team_id = p_team and user_id = me;
  perform private.audit(me, 'team.leave', 'team', p_team::text);
  if not exists (select 1 from public.team_members where team_id = p_team) then
    delete from public.teams where id = p_team; -- last one out removes the team (and its channels)
    perform private.audit(me, 'team.delete', 'team', p_team::text, '{"reason":"empty"}');
  elsif was_owner and not exists (select 1 from public.team_members where team_id = p_team and role = 'owner') then
    select user_id into successor from public.team_members where team_id = p_team order by joined_at limit 1;
    update public.team_members set role = 'owner' where team_id = p_team and user_id = successor;
  end if;
end $$;

create function public.remove_team_member(p_team uuid, p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if not (private.is_admin() or exists (select 1 from public.team_members where team_id = p_team and user_id = me and role = 'owner')) then
    raise exception 'forbidden';
  end if;
  if p_user = me then raise exception 'use_leave_team'; end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  perform private.audit(me, 'team.remove_member', 'team', p_team::text, jsonb_build_object('user', p_user));
end $$;

create function public.delete_team(p_team uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); tname text;
begin
  if not (private.is_admin() or exists (select 1 from public.team_members where team_id = p_team and user_id = me and role = 'owner')) then
    raise exception 'forbidden';
  end if;
  select name into tname from public.teams where id = p_team;
  delete from public.teams where id = p_team;
  perform private.audit(me, 'team.delete', 'team', p_team::text, jsonb_build_object('name', tname));
end $$;

-- ---------- messages ----------
create table public.messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index messages_channel_idx on public.messages (channel_id, created_at desc);
create index messages_user_idx on public.messages (user_id, created_at desc);
alter table public.messages enable row level security;
create policy "read messages of accessible channels" on public.messages for select to authenticated
  using (private.can_access_channel(channel_id));
create policy "post as yourself in accessible text channels" on public.messages for insert to authenticated
  with check (
    user_id = (select auth.uid()) and private.can_access_channel(channel_id)
    and exists (select 1 from public.channels c where c.id = channel_id and c.kind = 'text')
  );
revoke update, delete on public.messages from authenticated;

-- Anti-spam: at most 15 messages per 10 seconds per user.
create function private.messages_rate_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.messages where user_id = new.user_id and created_at > now() - interval '10 seconds') >= 15 then
    raise exception 'rate_limited';
  end if;
  return new;
end $$;
create trigger messages_rate_limit before insert on public.messages for each row execute function private.messages_rate_limit();

create function public.edit_message(p_id bigint, p_body text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); old_body text;
begin
  select body into old_body from public.messages where id = p_id and user_id = me and deleted_at is null;
  if old_body is null then raise exception 'forbidden'; end if;
  update public.messages set body = left(trim(p_body), 2000), edited_at = now() where id = p_id;
  perform private.audit(me, 'message.edit', 'message', p_id::text, jsonb_build_object('previous', old_body));
end $$;

create function public.delete_message(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); m public.messages;
begin
  select * into m from public.messages where id = p_id and deleted_at is null;
  if m.id is null or not (m.user_id = me or private.is_admin()) then raise exception 'forbidden'; end if;
  update public.messages set body = '[verwijderd]', deleted_at = now() where id = p_id;
  perform private.audit(me, 'message.delete', 'message', p_id::text, jsonb_build_object('author', m.user_id, 'body', m.body, 'channel', m.channel_id));
end $$;

-- ---------- seed channels ----------
insert into public.channels (name, kind, topic) values
  ('general', 'text', 'Welkom bij RAD Chat. Hier praat het hele bedrijf.'),
  ('random', 'text', 'Alles wat nergens anders past.'),
  ('announcements', 'text', 'Belangrijk nieuws.'),
  ('Lounge', 'voice', null),
  ('Stand-up', 'voice', null);

-- ---------- grants: nothing for anon, functions only for signed-in users ----------
revoke all on all tables in schema public from anon;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
