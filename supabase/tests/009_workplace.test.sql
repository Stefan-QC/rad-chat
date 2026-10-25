-- Workplace: status columns, work plans, on-call rosters and celebrations.
do $test$
declare
  u1 uuid; u2 uuid; u3 uuid; guest uuid; tid uuid; sid bigint; today_birthday int; rows_found int;
begin
  perform t.make_user('seed_admin');
  u1 := t.make_user('uone'); u2 := t.make_user('utwo'); u3 := t.make_user('uthree'); guest := t.make_user('guest', 'guest');

  -- status and profile fields are editable by yourself only
  perform t.as_user(u1);
  update public.profiles set status = 'meeting', status_text = 'In de stand-up', status_emoji = '📅', birth_month = 2, birth_day = 29, start_date = '2020-06-15', coffee_opt_in = true where id = u1;
  perform t.ok((select status from public.profiles where id = u1) = 'meeting', 'you can change your own status');
  perform t.throws(format('update public.profiles set status = %L where id = %L', 'nonsense', u1), 'violates check', 'unknown statuses are rejected');
  perform t.throws(format('update public.profiles set status_text = %L where id = %L', repeat('x', 81), u1), 'violates check', 'a status text is limited to 80 characters');
  update public.profiles set status = 'dnd' where id = u2;
  perform t.ok((select status from public.profiles where id = u2) <> 'dnd', 'you cannot change somebody elses status');

  -- work plans
  perform public.set_work_plan(current_date, 'office');
  perform public.set_work_plan(current_date + 1, 'home');
  perform public.set_work_plan(current_date, 'home');
  perform t.ok((select location from public.work_plans where user_id = u1 and day = current_date) = 'home', 'a work plan can be changed');
  perform public.set_work_plan(current_date + 1, null);
  perform t.ok((select count(*) from public.work_plans where user_id = u1) = 1, 'passing null removes a plan');
  perform t.throws(format('select public.set_work_plan(current_date + 200, %L)', 'office'), 'invalid_day', 'plans too far ahead are rejected');
  perform t.throws(format('select public.set_work_plan(current_date, %L)', 'moon'), 'invalid_location', 'unknown locations are rejected');
  perform t.as_user(u2);
  perform t.ok((select count(*) from public.work_plans where user_id = u1) = 1, 'colleagues can see each others plans');
  perform t.as_user(guest);
  perform t.ok((select count(*) from public.work_plans) = 0, 'guests do not see work plans');
  perform t.throws(format('select public.set_work_plan(current_date, %L)', 'home'), 'forbidden', 'guests cannot set work plans');

  -- on-call
  perform t.as_user(u1);
  tid := public.create_team('Platform');
  perform t.as_user(u2);
  perform public.join_team(tid);
  perform t.as_user(u1);
  sid := public.add_oncall_shift(tid, u2, now(), now() + interval '7 days', 'Week 43');
  perform t.ok((select count(*) from public.oncall_shifts where team_id = tid) = 1, 'a team owner can plan an on-call shift');
  perform t.throws(format('select public.add_oncall_shift(%L, %L, now() + interval ''3 days'', now() + interval ''10 days'')', tid, u2), 'overlap', 'shifts of one team cannot overlap');
  perform t.throws(format('select public.add_oncall_shift(%L, %L, now() + interval ''30 days'', now() + interval ''31 days'')', tid, u3), 'not_a_member', 'only team members can be on call');
  perform t.throws(format('select public.add_oncall_shift(%L, %L, now() + interval ''30 days'', now() + interval ''20 days'')', tid, u2), 'invalid_period', 'the end must come after the start');
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.oncall_shifts) = 0, 'outsiders cannot see a roster');
  perform t.as_user(u2);
  perform t.ok((select count(*) from public.oncall_shifts) = 1, 'team members can see the roster');
  perform t.throws(format('select public.add_oncall_shift(%L, %L, now() + interval ''30 days'', now() + interval ''31 days'')', tid, u2), 'forbidden', 'a plain member cannot edit the roster');
  perform t.as_user(u1);
  perform public.remove_oncall_shift(sid);
  perform t.ok((select count(*) from public.oncall_shifts) = 0, 'a shift can be removed');

  -- celebrations
  perform t.as_owner();
  update public.profiles set birth_month = extract(month from current_date + 3)::int, birth_day = extract(day from current_date + 3)::int, start_date = (current_date + 3 - interval '5 years')::date where id = u2;
  update public.profiles set birth_month = extract(month from current_date + 100)::int, birth_day = extract(day from current_date + 100)::int where id = u3;
  perform t.as_user(u1);
  perform t.ok((select count(*) from public.upcoming_celebrations(30) where user_id = u2 and kind = 'birthday') = 1, 'a birthday within 30 days is listed');
  perform t.ok((select years from public.upcoming_celebrations(30) where user_id = u2 and kind = 'anniversary') = 5, 'an anniversary shows the number of years');
  perform t.ok((select count(*) from public.upcoming_celebrations(30) where user_id = u3) = 0, 'a birthday further away is not listed yet');
  perform t.ok((select count(*) from public.upcoming_celebrations(366) where user_id = u3) = 1, 'it is listed when the window is wide enough');
  perform t.ok((select on_date from public.upcoming_celebrations(366) where user_id = u1 and kind = 'birthday') >= current_date, 'a 29 February birthday always gets a valid upcoming date');
  perform t.as_user(guest);
  perform t.ok((select count(*) from public.upcoming_celebrations(366)) = 0, 'guests do not see celebrations');
end $test$;
