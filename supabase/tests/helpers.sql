-- Small assertion helpers for the SQL tests; a failing check raises an exception and stops the test file.

create schema t;
grant usage on schema t to authenticated, service_role;

create function t.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  raise notice 'ok - %', name;
end $$;

-- Runs a statement and passes only when it fails with a message containing the expected text.
create function t.throws(stmt text, expected text, name text) returns void language plpgsql as $$
declare failed boolean := false; msg text;
begin
  begin
    execute stmt;
  exception when others then
    failed := true;
    msg := sqlerrm;
  end;
  if not failed then raise exception 'FAIL (no error raised): %', name; end if;
  if msg not like '%' || expected || '%' then raise exception 'FAIL: % (got "%")', name, msg; end if;
  raise notice 'ok - %', name;
end $$;

create function t.as_user(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function t.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end $$;

create function t.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- Creates users the way Supabase Auth does; the trigger builds the profile.
create function t.make_user(uname text, urole text default 'member') returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data) values (uid, uname || '@test.nl', jsonb_build_object('username', uname));
  if urole <> 'member' then update public.profiles set role = urole where id = uid; end if;
  return uid;
end $$;
