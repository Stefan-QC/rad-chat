-- Per-user settings (theme, notifications) and a helper that locks down function privileges after every migration.

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  notify_mentions boolean not null default true,
  notify_messages boolean not null default true,
  notify_sound boolean not null default false,
  notify_browser boolean not null default false,
  compact_mode boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "read own settings" on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own settings" on public.user_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own settings" on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke delete on public.user_settings from authenticated;

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger user_settings_touch before update on public.user_settings for each row execute function private.touch_updated_at();

-- Signed-in users may call every public function except jobs_*, which only the server (service role) may run. Anonymous users may call none.
create function private.lock_down_functions() returns void language plpgsql set search_path = '' as $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname like 'jobs\_%' then
      execute format('revoke execute on function %s from authenticated', r.sig);
      execute format('grant execute on function %s to service_role', r.sig);
    else
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
  revoke all on all tables in schema public from anon;
end $$;

select private.lock_down_functions();
