-- Accounts are managed in Supabase only: nobody, not even an admin, can change roles or accounts through the app's database access.
do $test$
declare admin_id uuid; member uuid; other uuid; name_before text; removed int := 0; created boolean := true;
begin
  admin_id := t.make_user('acc_admin'); -- the first account is an admin
  member := t.make_user('acc_member'); other := t.make_user('acc_other');
  select display_name into name_before from public.profiles where id = other;

  perform t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_user_role'), 'there is no function to change roles anymore');

  -- an admin cannot change the role or status of somebody else
  perform t.as_user(admin_id);
  perform t.throws(format('update public.profiles set role = %L where id = %L', 'admin', member), 'permission denied', 'an admin cannot update a role');
  perform t.throws(format('update public.profiles set deactivated_at = now() where id = %L', member), 'permission denied', 'an admin cannot deactivate an account');
  perform t.throws(format('update public.profiles set expires_at = now() where id = %L', member), 'permission denied', 'an admin cannot set an expiry date');
  update public.profiles set display_name = 'Hacked' where id = other;
  perform t.as_owner();
  perform t.ok((select display_name from public.profiles where id = other) = name_before, 'an admin cannot edit the profile of somebody else');

  -- a member cannot promote themselves or reactivate themselves
  perform t.as_user(member);
  perform t.throws(format('update public.profiles set role = %L where id = %L', 'admin', member), 'permission denied', 'a member cannot promote themselves');
  perform t.throws(format('update public.profiles set deactivated_at = null where id = %L', member), 'permission denied', 'a member cannot change their own status');
  update public.profiles set display_name = 'New name' where id = member;
  perform t.as_owner();
  perform t.ok((select display_name from public.profiles where id = member) = 'New name', 'everybody can still edit their own profile');

  -- profiles cannot be deleted or created by signed-in users either (row level security or missing rights stop it)
  perform t.as_user(admin_id);
  begin
    delete from public.profiles where id = member;
    get diagnostics removed = row_count;
  exception when others then removed := 0;
  end;
  begin
    insert into public.profiles (id, username, display_name) values (gen_random_uuid(), 'ghost', 'Ghost');
  exception when others then created := false;
  end;
  perform t.as_owner();
  perform t.ok(removed = 0 and exists (select 1 from public.profiles where id = member), 'an admin cannot delete a profile');
  perform t.ok(not created and not exists (select 1 from public.profiles where username = 'ghost'), 'an admin cannot create a profile');
end
$test$;
