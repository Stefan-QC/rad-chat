-- Workplace: status and availability, weekly work plans, on-call rosters, birthdays and work anniversaries.

-- ---------- profile fields ----------
alter table public.profiles
  add column status text not null default 'available' check (status in ('available', 'busy', 'meeting', 'away', 'dnd')),
  add column status_text text check (char_length(status_text) <= 80),
  add column status_emoji text check (char_length(status_emoji) <= 8),
  add column status_until timestamptz,
  add column birth_month smallint check (birth_month between 1 and 12),
  add column birth_day smallint check (birth_day between 1 and 31),
  add column start_date date,
  add column coffee_opt_in boolean not null default false;
grant update (status, status_text, status_emoji, status_until, birth_month, birth_day, start_date, coffee_opt_in) on public.profiles to authenticated;

create function private.is_team_member(tid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = tid and user_id = (select auth.uid()));
$$;
create function private.is_team_moderator(tid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (select 1 from public.team_members where team_id = tid and user_id = (select auth.uid()) and role in ('owner', 'moderator'));
$$;
grant execute on function private.is_team_member(uuid), private.is_team_moderator(uuid) to authenticated;

-- ---------- weekly work plans ----------
create table public.work_plans (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  location text not null check (location in ('office', 'home', 'off', 'travel')),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index work_plans_day_idx on public.work_plans (day);
alter table public.work_plans enable row level security;
create policy "plans visible to colleagues" on public.work_plans for select to authenticated using (private.is_active() and not private.is_guest());
revoke insert, update, delete on public.work_plans from authenticated;

-- Sets where you work on a day; passing null removes the plan for that day.
create function public.set_work_plan(p_day date, p_location text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if p_day < current_date - 1 or p_day > current_date + 90 then raise exception 'invalid_day'; end if;
  if p_location is null then
    delete from public.work_plans where user_id = me and day = p_day;
  else
    if p_location not in ('office', 'home', 'off', 'travel') then raise exception 'invalid_location'; end if;
    insert into public.work_plans (user_id, day, location) values (me, p_day, p_location)
    on conflict (user_id, day) do update set location = excluded.location, updated_at = now();
  end if;
end $$;

-- ---------- on-call rosters ----------
create table public.oncall_shifts (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (char_length(note) <= 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index oncall_team_idx on public.oncall_shifts (team_id, starts_at);
create index oncall_user_idx on public.oncall_shifts (user_id);
create index oncall_created_by_idx on public.oncall_shifts (created_by);
alter table public.oncall_shifts enable row level security;
create policy "team members see the roster" on public.oncall_shifts for select to authenticated using (private.is_team_member(team_id) or private.is_admin());
revoke insert, update, delete on public.oncall_shifts from authenticated;

create function public.add_oncall_shift(p_team uuid, p_user uuid, p_start timestamptz, p_end timestamptz, p_note text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); sid bigint;
begin
  if not private.is_team_moderator(p_team) then raise exception 'forbidden'; end if;
  if p_end <= p_start or p_end > p_start + interval '60 days' then raise exception 'invalid_period'; end if;
  if not exists (select 1 from public.team_members where team_id = p_team and user_id = p_user) then raise exception 'not_a_member'; end if;
  if exists (select 1 from public.oncall_shifts where team_id = p_team and tstzrange(starts_at, ends_at) && tstzrange(p_start, p_end)) then raise exception 'overlap'; end if;
  insert into public.oncall_shifts (team_id, user_id, starts_at, ends_at, note, created_by)
  values (p_team, p_user, p_start, p_end, nullif(trim(p_note), ''), me) returning id into sid;
  perform private.audit(me, 'oncall.add', 'team', p_team::text, jsonb_build_object('user', p_user, 'from', p_start, 'to', p_end));
  return sid;
end $$;

create function public.remove_oncall_shift(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  select team_id into tid from public.oncall_shifts where id = p_id;
  if tid is null then return; end if;
  if not private.is_team_moderator(tid) then raise exception 'forbidden'; end if;
  delete from public.oncall_shifts where id = p_id;
  perform private.audit((select auth.uid()), 'oncall.remove', 'team', tid::text, jsonb_build_object('shift', p_id));
end $$;

-- ---------- birthdays and work anniversaries ----------
create table public.celebration_log (
  on_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('birthday', 'anniversary')),
  primary key (on_date, user_id, kind)
);
alter table public.celebration_log enable row level security; -- only the server job touches this table

-- The next occurrence of each birthday and anniversary within the coming days; 29 February moves to 1 March in other years.
create function public.upcoming_celebrations(p_days int default 30) returns table (user_id uuid, kind text, on_date date, years int)
language sql stable security definer set search_path = '' as $$
  with base as (
    select p.id, 'birthday'::text as kind, p.birth_month::int as month, p.birth_day::int as day, null::date as since
    from public.profiles p where p.birth_month is not null and p.birth_day is not null and p.deactivated_at is null
    union all
    select p.id, 'anniversary', extract(month from p.start_date)::int, extract(day from p.start_date)::int, p.start_date
    from public.profiles p where p.start_date is not null and p.deactivated_at is null
  ), next as (
    select b.*, case when make_date(extract(year from current_date)::int, b.month, 1) + (b.day - 1) >= current_date
                     then make_date(extract(year from current_date)::int, b.month, 1) + (b.day - 1)
                     else make_date(extract(year from current_date)::int + 1, b.month, 1) + (b.day - 1) end as on_date
    from base b
  )
  select n.id, n.kind, n.on_date, case when n.kind = 'anniversary' then extract(year from n.on_date)::int - extract(year from n.since)::int end
  from next n
  where private.is_active() and not private.is_guest()
    and n.on_date <= current_date + greatest(least(coalesce(p_days, 30), 366), 1)
    and (n.kind = 'birthday' or extract(year from n.on_date)::int > extract(year from n.since)::int)
  order by n.on_date, n.id;
$$;

alter publication supabase_realtime add table public.work_plans;

select private.lock_down_functions();
