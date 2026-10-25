-- Work tools: polls in channels, tasks, a knowledge base with history, and meeting notes with decisions.

create function private.can_read_scope(tid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active() and (case when tid is null then not private.is_guest() else private.is_team_member(tid) or private.is_admin() end);
$$;
grant execute on function private.can_read_scope(uuid) to authenticated;

-- ---------- polls ----------
create table public.polls (
  id bigint generated always as identity primary key,
  message_id bigint not null unique references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  multiple boolean not null default false,
  closes_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index polls_channel_idx on public.polls (channel_id);
create index polls_created_by_idx on public.polls (created_by);
create table public.poll_options (
  id bigint generated always as identity primary key,
  poll_id bigint not null references public.polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  position smallint not null
);
create index poll_options_poll_idx on public.poll_options (poll_id);
create table public.poll_votes (
  poll_id bigint not null references public.polls(id) on delete cascade,
  option_id bigint not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index poll_votes_poll_idx on public.poll_votes (poll_id);
create index poll_votes_user_idx on public.poll_votes (user_id);

create function private.can_access_poll(pid bigint) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.polls p where p.id = pid and private.can_access_channel(p.channel_id));
$$;
grant execute on function private.can_access_poll(bigint) to authenticated;

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
create policy "polls follow channel access" on public.polls for select to authenticated using (private.can_access_channel(channel_id));
create policy "options follow poll access" on public.poll_options for select to authenticated using (private.can_access_poll(poll_id));
create policy "votes follow poll access" on public.poll_votes for select to authenticated using (private.can_access_poll(poll_id));
revoke insert, update, delete on public.polls, public.poll_options, public.poll_votes from authenticated;

create function public.create_poll(p_channel uuid, p_question text, p_options text[], p_multiple boolean default false, p_closes_at timestamptz default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); q text := trim(coalesce(p_question, '')); labels text[]; msg_id bigint; pid bigint; i int;
begin
  if me is null or not private.is_active() or not private.can_post(p_channel) then raise exception 'forbidden'; end if;
  if char_length(q) not between 1 and 200 then raise exception 'invalid_question'; end if;
  select array_agg(label order by first_seen) into labels
  from (select trim(l) as label, min(ord) as first_seen from unnest(p_options) with ordinality as t(l, ord) where trim(l) <> '' group by trim(l)) s;
  if coalesce(array_length(labels, 1), 0) not between 2 and 10 or exists (select 1 from unnest(labels) l where char_length(l) > 100) then raise exception 'invalid_options'; end if;
  if p_closes_at is not null and (p_closes_at <= now() or p_closes_at > now() + interval '30 days') then raise exception 'invalid_close_time'; end if;
  insert into public.messages (channel_id, user_id, body, kind) values (p_channel, me, q, 'poll') returning id into msg_id;
  insert into public.polls (message_id, channel_id, question, multiple, closes_at, created_by) values (msg_id, p_channel, q, p_multiple, p_closes_at, me) returning id into pid;
  for i in 1..array_length(labels, 1) loop
    insert into public.poll_options (poll_id, label, position) values (pid, labels[i], i);
  end loop;
  return pid;
end $$;

-- Toggles your vote on an option; on a single-choice poll a new vote replaces the old one.
create function public.vote_poll(p_option bigint) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); p public.polls;
begin
  select pl.* into p from public.poll_options o join public.polls pl on pl.id = o.poll_id where o.id = p_option;
  if p.id is null or me is null or not private.can_access_channel(p.channel_id) then raise exception 'forbidden'; end if;
  if p.closes_at is not null and p.closes_at <= now() then raise exception 'poll_closed'; end if;
  if exists (select 1 from public.poll_votes where option_id = p_option and user_id = me) then
    delete from public.poll_votes where option_id = p_option and user_id = me;
    return;
  end if;
  if not p.multiple then delete from public.poll_votes where poll_id = p.id and user_id = me; end if;
  insert into public.poll_votes (poll_id, option_id, user_id) values (p.id, p_option, me);
end $$;

-- ---------- knowledge base ----------
create table public.kb_pages (
  id bigint generated always as identity primary key,
  team_id uuid references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 20000),
  category text check (char_length(category) <= 40),
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', title || ' ' || body)) stored
);
create unique index kb_pages_title_idx on public.kb_pages (coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(title));
create index kb_pages_search_idx on public.kb_pages using gin (search);
create index kb_pages_created_by_idx on public.kb_pages (created_by);
create index kb_pages_updated_by_idx on public.kb_pages (updated_by);
create table public.kb_versions (
  id bigint generated always as identity primary key,
  page_id bigint not null references public.kb_pages(id) on delete cascade,
  version int not null,
  title text not null,
  body text not null,
  edited_by uuid references public.profiles(id) on delete set null,
  edited_at timestamptz not null default now(),
  unique (page_id, version)
);
create index kb_versions_edited_by_idx on public.kb_versions (edited_by);
alter table public.kb_pages enable row level security;
alter table public.kb_versions enable row level security;
create policy "kb pages by scope" on public.kb_pages for select to authenticated using (private.can_read_scope(team_id));
create policy "kb versions follow the page" on public.kb_versions for select to authenticated
  using (exists (select 1 from public.kb_pages p where p.id = page_id and private.can_read_scope(p.team_id)));
revoke insert, update, delete on public.kb_pages, public.kb_versions from authenticated;

create function private.kb_keep_version() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (new.title, new.body) is distinct from (old.title, old.body) then
    insert into public.kb_versions (page_id, version, title, body, edited_by)
    values (new.id, coalesce((select max(version) from public.kb_versions where page_id = new.id), 0) + 1, new.title, new.body, new.updated_by);
  end if;
  return new;
end $$;
create trigger kb_keep_version after insert or update on public.kb_pages for each row execute function private.kb_keep_version();

-- Company pages can be edited by admins, team pages by team members; only moderators pin pages.
create function public.save_kb_page(p_id bigint, p_team uuid, p_title text, p_body text, p_category text default null, p_pinned boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); pid bigint := p_id; existing public.kb_pages; scope uuid := p_team; may_pin boolean;
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if p_id is not null then
    select * into existing from public.kb_pages where id = p_id;
    if existing.id is null then raise exception 'not_found'; end if;
    scope := existing.team_id;
  end if;
  if scope is null then
    if not private.is_admin() then raise exception 'forbidden'; end if;
    may_pin := true;
  else
    if not private.is_team_member(scope) then raise exception 'forbidden'; end if;
    may_pin := private.is_team_moderator(scope);
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'invalid_title'; end if;
  if pid is null then
    insert into public.kb_pages (team_id, title, body, category, pinned, created_by, updated_by)
    values (scope, trim(p_title), coalesce(p_body, ''), nullif(trim(p_category), ''), coalesce(p_pinned and may_pin, false), me, me) returning id into pid;
  else
    update public.kb_pages set title = trim(p_title), body = coalesce(p_body, ''), category = nullif(trim(p_category), ''),
      pinned = case when may_pin then coalesce(p_pinned, pinned) else pinned end, updated_by = me, updated_at = now() where id = pid;
  end if;
  return pid;
end $$;

create function public.delete_kb_page(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare tid uuid; found boolean;
begin
  select team_id, true into tid, found from public.kb_pages where id = p_id;
  if found is null then return; end if;
  if not (case when tid is null then private.is_admin() else private.is_team_moderator(tid) end) then raise exception 'forbidden'; end if;
  delete from public.kb_pages where id = p_id;
  perform private.audit((select auth.uid()), 'kb.delete', 'kb_page', p_id::text);
end $$;

-- ---------- meeting notes and decisions ----------
create table public.meeting_notes (
  id bigint generated always as identity primary key,
  team_id uuid references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  held_at timestamptz not null default now(),
  attendees uuid[] not null default '{}',
  notes text not null default '' check (char_length(notes) <= 20000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meeting_notes_team_idx on public.meeting_notes (team_id, held_at desc);
create index meeting_notes_created_by_idx on public.meeting_notes (created_by);
create table public.decisions (
  id bigint generated always as identity primary key,
  meeting_id bigint not null references public.meeting_notes(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  decided_on date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index decisions_meeting_idx on public.decisions (meeting_id);
create index decisions_team_idx on public.decisions (team_id);
create index decisions_created_by_idx on public.decisions (created_by);
alter table public.meeting_notes enable row level security;
alter table public.decisions enable row level security;
create policy "meetings by scope" on public.meeting_notes for select to authenticated using (private.can_read_scope(team_id));
create policy "decisions by scope" on public.decisions for select to authenticated using (private.can_read_scope(team_id));
revoke insert, update, delete on public.meeting_notes, public.decisions from authenticated;

create function public.save_meeting(p_id bigint, p_team uuid, p_title text, p_held_at timestamptz, p_attendees uuid[], p_notes text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); mid bigint := p_id; existing public.meeting_notes; scope uuid := p_team;
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if p_id is not null then
    select * into existing from public.meeting_notes where id = p_id;
    if existing.id is null then raise exception 'not_found'; end if;
    scope := existing.team_id;
    if not (existing.created_by = me or (scope is not null and private.is_team_moderator(scope)) or private.is_admin()) then raise exception 'forbidden'; end if;
  elsif scope is not null and not private.is_team_member(scope) then
    raise exception 'forbidden';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 150 then raise exception 'invalid_title'; end if;
  if mid is null then
    insert into public.meeting_notes (team_id, title, held_at, attendees, notes, created_by)
    values (scope, trim(p_title), coalesce(p_held_at, now()), coalesce(p_attendees, '{}'), coalesce(p_notes, ''), me) returning id into mid;
  else
    update public.meeting_notes set title = trim(p_title), held_at = coalesce(p_held_at, held_at), attendees = coalesce(p_attendees, attendees),
      notes = coalesce(p_notes, notes), updated_at = now() where id = mid;
  end if;
  return mid;
end $$;

create function public.add_decision(p_meeting bigint, p_text text) returns bigint language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); m public.meeting_notes; did bigint;
begin
  select * into m from public.meeting_notes where id = p_meeting;
  if m.id is null or not private.can_read_scope(m.team_id) or private.is_guest() then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_text, ''))) not between 1 and 500 then raise exception 'invalid_text'; end if;
  insert into public.decisions (meeting_id, team_id, text, created_by) values (m.id, m.team_id, trim(p_text), me) returning id into did;
  return did;
end $$;

create function public.delete_decision(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare d public.decisions;
begin
  select * into d from public.decisions where id = p_id;
  if d.id is null then return; end if;
  if not (d.created_by = (select auth.uid()) or (d.team_id is not null and private.is_team_moderator(d.team_id)) or private.is_admin()) then raise exception 'forbidden'; end if;
  delete from public.decisions where id = p_id;
end $$;

create function public.delete_meeting(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare m public.meeting_notes;
begin
  select * into m from public.meeting_notes where id = p_id;
  if m.id is null then return; end if;
  if not (m.created_by = (select auth.uid()) or (m.team_id is not null and private.is_team_moderator(m.team_id)) or private.is_admin()) then raise exception 'forbidden'; end if;
  delete from public.meeting_notes where id = p_id;
end $$;

-- ---------- tasks ----------
create table public.tasks (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  team_id uuid references public.teams(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  message_id bigint references public.messages(id) on delete set null,
  meeting_id bigint references public.meeting_notes(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index tasks_assignee_idx on public.tasks (assignee_id, status);
create index tasks_creator_idx on public.tasks (created_by);
create index tasks_team_idx on public.tasks (team_id);
create index tasks_channel_idx on public.tasks (channel_id);
create index tasks_message_idx on public.tasks (message_id);
create index tasks_meeting_idx on public.tasks (meeting_id);
alter table public.tasks enable row level security;
create policy "tasks for people involved" on public.tasks for select to authenticated using (
  private.is_active() and (created_by = (select auth.uid()) or assignee_id = (select auth.uid()) or private.is_admin()
                           or (team_id is not null and private.is_team_member(team_id))));
revoke insert, update, delete on public.tasks from authenticated;

create function public.create_task(p_title text, p_description text default null, p_assignee uuid default null, p_due date default null,
                                   p_team uuid default null, p_message bigint default null, p_meeting bigint default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); tid bigint; cid uuid; actor text; title text := trim(coalesce(p_title, ''));
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if char_length(title) not between 1 and 200 then raise exception 'invalid_title'; end if;
  if p_team is not null and not private.is_team_member(p_team) then raise exception 'forbidden'; end if;
  if p_assignee is not null and not exists (select 1 from public.profiles where id = p_assignee and deactivated_at is null and role <> 'guest') then raise exception 'invalid_assignee'; end if;
  if p_assignee is not null and p_team is not null and not exists (select 1 from public.team_members where team_id = p_team and user_id = p_assignee) then raise exception 'not_a_member'; end if;
  if p_message is not null then
    select channel_id into cid from public.messages where id = p_message;
    if cid is null or not private.can_access_channel(cid) then raise exception 'forbidden'; end if;
  end if;
  if p_meeting is not null and not exists (select 1 from public.meeting_notes where id = p_meeting and private.can_read_scope(team_id)) then raise exception 'forbidden'; end if;
  insert into public.tasks (title, description, team_id, channel_id, message_id, meeting_id, assignee_id, created_by, due_date)
  values (title, nullif(trim(p_description), ''), p_team, cid, p_message, p_meeting, p_assignee, me, p_due) returning id into tid;
  if p_assignee is not null and p_assignee <> me then
    select display_name into actor from public.profiles where id = me;
    perform private.notify(p_assignee, 'task', me, cid, p_message, actor || ' assigned you a task', title, '/tasks');
  end if;
  return tid;
end $$;

create function private.can_manage_task(t public.tasks) returns boolean language sql stable security definer set search_path = '' as $$
  select t.created_by = (select auth.uid()) or private.is_admin() or (t.team_id is not null and private.is_team_moderator(t.team_id));
$$;
grant execute on function private.can_manage_task(public.tasks) to authenticated;

create function public.update_task(p_id bigint, p_title text, p_description text, p_assignee uuid, p_due date) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_id;
  if t.id is null or not private.can_manage_task(t) then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 200 then raise exception 'invalid_title'; end if;
  if p_assignee is not null and not exists (select 1 from public.profiles where id = p_assignee and deactivated_at is null and role <> 'guest') then raise exception 'invalid_assignee'; end if;
  if p_assignee is not null and t.team_id is not null and not exists (select 1 from public.team_members where team_id = t.team_id and user_id = p_assignee) then raise exception 'not_a_member'; end if;
  update public.tasks set title = trim(p_title), description = nullif(trim(p_description), ''), assignee_id = p_assignee, due_date = p_due where id = p_id;
  if p_assignee is not null and p_assignee is distinct from t.assignee_id and p_assignee <> (select auth.uid()) then
    perform private.notify(p_assignee, 'task', (select auth.uid()), t.channel_id, t.message_id, 'A task was assigned to you', trim(p_title), '/tasks');
  end if;
end $$;

create function public.set_task_status(p_id bigint, p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks; me uuid := (select auth.uid());
begin
  if p_status not in ('open', 'done') then raise exception 'invalid_status'; end if;
  select * into t from public.tasks where id = p_id;
  if t.id is null or not (t.assignee_id = me or private.can_manage_task(t) or (t.team_id is not null and private.is_team_member(t.team_id))) then raise exception 'forbidden'; end if;
  update public.tasks set status = p_status, completed_at = case when p_status = 'done' then now() end where id = p_id;
end $$;

create function public.delete_task(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_id;
  if t.id is null then return; end if;
  if not private.can_manage_task(t) then raise exception 'forbidden'; end if;
  delete from public.tasks where id = p_id;
end $$;

alter publication supabase_realtime add table public.polls, public.poll_votes, public.tasks;

select private.lock_down_functions();
