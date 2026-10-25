-- Background jobs. Only the service role (the Python API) may run the jobs_* functions; signed-in users cannot.

-- The celebration rules without any permission checks, shared by the public list and the nightly job.
create function private.celebrations(p_days int) returns table (user_id uuid, kind text, on_date date, years int)
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
  where n.on_date <= current_date + greatest(least(coalesce(p_days, 30), 366), 0)
    and (n.kind = 'birthday' or extract(year from n.on_date)::int > extract(year from n.since)::int)
  order by n.on_date, n.id;
$$;

create or replace function public.upcoming_celebrations(p_days int default 30) returns table (user_id uuid, kind text, on_date date, years int)
language sql stable security definer set search_path = '' as $$
  select c.user_id, c.kind, c.on_date, c.years from private.celebrations(p_days) c where private.is_active() and not private.is_guest();
$$;

-- Finds or creates the direct message conversation between two people, without needing a signed-in user.
create function private.ensure_dm(a uuid, b uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select c.id into cid from public.channels c
  where c.kind = 'dm'
    and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = a)
    and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = b)
  limit 1;
  if cid is null then
    insert into public.channels (name, kind, is_private, created_by) values ('dm-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'dm', true, a) returning id into cid;
    insert into public.channel_members (channel_id, user_id) values (cid, a), (cid, b);
  end if;
  return cid;
end $$;

-- ---------- jobs ----------
create function public.jobs_expire_guests() returns jsonb language sql security definer set search_path = '' as $$
  with expired as (
    update public.profiles set deactivated_at = now()
    where role = 'guest' and deactivated_at is null and expires_at is not null and expires_at <= now()
    returning id
  )
  select jsonb_build_object('expired', count(*), 'user_ids', coalesce(jsonb_agg(id), '[]'::jsonb)) from expired;
$$;

-- Deletes messages older than the retention period; the storage paths of their images are returned so the files can be removed too.
create function public.jobs_purge_messages() returns jsonb language plpgsql security definer set search_path = '' as $$
declare days int; cutoff timestamptz; paths text[]; removed int;
begin
  select coalesce(nullif(value, '')::int, 0) into days from public.app_settings where key = 'message_retention_days';
  if coalesce(days, 0) <= 0 then return jsonb_build_object('deleted', 0, 'days', 0, 'storage_paths', '[]'::jsonb); end if;
  cutoff := now() - make_interval(days => days);
  select coalesce(array_agg(a.storage_path), '{}') into paths
  from public.message_attachments a join public.messages m on m.id = a.message_id
  where m.created_at < cutoff and a.storage_path is not null;
  delete from public.messages where created_at < cutoff;
  get diagnostics removed = row_count;
  return jsonb_build_object('deleted', removed, 'days', days, 'storage_paths', to_jsonb(paths));
end $$;

-- Announces today's birthdays and work anniversaries once, mentioning the person so they get a notification.
create function public.jobs_post_celebrations() returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; ann uuid; poster uuid; posted int := 0; uname text; text_body text;
begin
  select id into ann from public.channels where name = 'announcements' and team_id is null and kind = 'text' limit 1;
  select id into poster from public.profiles where role = 'admin' and deactivated_at is null order by created_at limit 1;
  if ann is null or poster is null then return jsonb_build_object('posted', 0); end if;
  for c in select * from private.celebrations(0) x where x.on_date = current_date loop
    continue when exists (select 1 from public.celebration_log l where l.on_date = c.on_date and l.user_id = c.user_id and l.kind = c.kind);
    select username into uname from public.profiles where id = c.user_id;
    text_body := case when c.kind = 'birthday' then '🎂 Happy birthday @' || uname || '! Have a great day! 🎉'
                      else '🏆 @' || uname || ' has been at Qualogy for ' || c.years || (case when c.years = 1 then ' year' else ' years' end) || ' today. Congratulations!' end;
    insert into public.messages (channel_id, user_id, body) values (ann, poster, text_body);
    insert into public.celebration_log (on_date, user_id, kind) values (c.on_date, c.user_id, c.kind);
    posted := posted + 1;
  end loop;
  return jsonb_build_object('posted', posted);
end $$;

-- Pairs up colleagues who opted in, preferring people who have not met in the last two months.
create function public.jobs_run_coffee_round() returns jsonb language plpgsql security definer set search_path = '' as $$
declare rid bigint; people uuid[]; a uuid; b uuid; dm uuid; pairs int := 0; name_a text; name_b text;
begin
  insert into public.coffee_rounds (started_on) values (current_date) on conflict (started_on) do nothing returning id into rid;
  if rid is null then return jsonb_build_object('skipped', 'already_ran_today'); end if;
  people := array(select id from public.profiles where coffee_opt_in and deactivated_at is null and role <> 'guest' order by random());
  while coalesce(array_length(people, 1), 0) >= 2 loop
    a := people[1];
    people := people[2:array_length(people, 1)];
    select c into b from unnest(people) as c
    where not exists (
      select 1 from public.coffee_pairs cp join public.coffee_rounds r on r.id = cp.round_id
      where r.started_on > current_date - 60 and cp.user_a = least(a, c) and cp.user_b = greatest(a, c))
    limit 1;
    if b is null then b := people[1]; end if;
    people := array_remove(people, b);
    dm := private.ensure_dm(a, b);
    insert into public.coffee_pairs (round_id, user_a, user_b, channel_id) values (rid, least(a, b), greatest(a, b), dm);
    select display_name into name_a from public.profiles where id = a;
    select display_name into name_b from public.profiles where id = b;
    perform private.notify(a, 'coffee', b, dm, null, 'Coffee time ☕', 'This week you are matched with ' || name_b || '. Plan a chat!', '/channels/' || dm);
    perform private.notify(b, 'coffee', a, dm, null, 'Coffee time ☕', 'This week you are matched with ' || name_a || '. Plan a chat!', '/channels/' || dm);
    pairs := pairs + 1;
  end loop;
  return jsonb_build_object('round', rid, 'pairs', pairs, 'unpaired', coalesce(array_length(people, 1), 0));
end $$;

select private.lock_down_functions();
