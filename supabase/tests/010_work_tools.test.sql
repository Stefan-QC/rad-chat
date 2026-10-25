-- Work tools: polls, tasks, knowledge base and meeting notes with decisions.
do $test$
declare
  admin_id uuid; u1 uuid; u2 uuid; u3 uuid; guest uuid; gen uuid; priv uuid; tid uuid;
  poll bigint; opt1 bigint; opt2 bigint; opt3 bigint; task bigint; page bigint; team_page bigint; meeting bigint; dec bigint; pinned_page bigint; msg public.messages; n int;
begin
  admin_id := t.make_user('seed_admin');
  u1 := t.make_user('uone'); u2 := t.make_user('utwo'); u3 := t.make_user('uthree'); guest := t.make_user('guest', 'guest');
  select id into gen from public.channels where name = 'general' and team_id is null;

  -- ===== polls =====
  perform t.as_user(u1);
  poll := public.create_poll(gen, 'Waar lunchen we?', array['Pizza', 'Sushi', '  Pizza  ', 'Salade']);
  perform t.ok((select count(*) from public.poll_options where poll_id = poll) = 3, 'duplicate and blank options are dropped');
  perform t.ok((select kind from public.messages m join public.polls p on p.message_id = m.id where p.id = poll) = 'poll', 'a poll creates a poll message in the channel');
  perform t.throws(format('select public.create_poll(%L, %L, array[%L])', gen, 'Eén optie?', 'Alleen dit'), 'invalid_options', 'a poll needs at least two options');
  perform t.throws(format('select public.create_poll(%L, %L, array[%L, %L], false, now() - interval ''1 hour'')', gen, 'Verleden?', 'a', 'b'), 'invalid_close_time', 'a poll cannot close in the past');
  perform t.throws(format('select public.create_poll(%L, %L, array[%L, %L])', gen, '   ', 'a', 'b'), 'invalid_question', 'a poll needs a question');
  select id into opt1 from public.poll_options where poll_id = poll and position = 1;
  select id into opt2 from public.poll_options where poll_id = poll and position = 2;
  select id into opt3 from public.poll_options where poll_id = poll and position = 3;
  perform t.as_user(u2);
  perform public.vote_poll(opt1);
  perform public.vote_poll(opt2);
  perform t.ok((select count(*) from public.poll_votes where user_id = u2 and poll_id = poll) = 1 and (select option_id from public.poll_votes where user_id = u2) = opt2, 'a single-choice vote replaces the earlier vote');
  perform public.vote_poll(opt2);
  perform t.ok((select count(*) from public.poll_votes where user_id = u2) = 0, 'voting on the same option again removes the vote');
  perform t.as_user(guest);
  perform t.ok((select count(*) from public.polls) = 0, 'guests do not see company polls');
  perform t.throws(format('select public.vote_poll(%s)', opt1), 'forbidden', 'guests cannot vote on company polls');
  perform t.as_user(u1);
  poll := public.create_poll(gen, 'Meerdere antwoorden', array['a', 'b', 'c'], true);
  select id into opt1 from public.poll_options where poll_id = poll and position = 1;
  select id into opt2 from public.poll_options where poll_id = poll and position = 2;
  perform public.vote_poll(opt1);
  perform public.vote_poll(opt2);
  perform t.ok((select count(*) from public.poll_votes where user_id = u1 and poll_id = poll) = 2, 'a multiple-choice poll accepts several votes');
  perform t.as_owner();
  update public.polls set closes_at = now() - interval '1 minute' where id = poll;
  perform t.as_user(u1);
  perform t.throws(format('select public.vote_poll(%s)', opt1), 'poll_closed', 'a closed poll rejects votes');
  priv := public.create_private_channel('geheim', null, null, array[u2]);
  perform public.create_poll(priv, 'Alleen wij', array['ja', 'nee']);
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.polls where channel_id = priv) = 0, 'polls in a private channel are hidden from outsiders');

  -- ===== tasks =====
  perform t.as_user(u1);
  tid := public.create_team('Platform');
  perform t.as_user(u2);
  perform public.join_team(tid);
  perform t.as_user(u1);
  msg := public.send_message(gen, 'Kunnen we de release plannen?');
  task := public.create_task('Release plannen', 'Voor vrijdag', u2, current_date + 3, null, msg.id);
  perform t.ok((select channel_id from public.tasks where id = task) = gen, 'a task made from a message remembers its channel');
  perform t.as_owner();
  perform t.ok((select count(*) from public.notifications where user_id = u2 and kind = 'task') = 1, 'the assignee is notified');
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.tasks) = 0, 'a task is hidden from people who are not involved');
  perform t.as_user(u2);
  perform t.ok((select count(*) from public.tasks) = 1, 'the assignee sees the task');
  perform public.set_task_status(task, 'done');
  perform t.ok((select status = 'done' and completed_at is not null from public.tasks where id = task), 'the assignee can complete a task');
  perform t.throws(format('select public.delete_task(%s)', task), 'forbidden', 'the assignee cannot delete a task made by somebody else');
  perform t.throws(format('select public.update_task(%s, %L, null, %L, null)', task, 'Nieuw', u3), 'forbidden', 'the assignee cannot edit a task made by somebody else');
  perform t.as_user(u1);
  perform public.update_task(task, 'Release plannen v2', null, u2, null);
  perform t.ok((select title from public.tasks where id = task) = 'Release plannen v2', 'the creator can edit a task');
  task := public.create_task('Teamtaak', null, u2, null, tid);
  perform t.throws(format('select public.create_task(%L, null, %L, null, %L)', 'Fout', u3, tid), 'not_a_member', 'a team task can only be assigned to team members');
  perform t.throws(format('select public.create_task(%L, null, %L)', '   ', u2), 'invalid_title', 'a task needs a title');
  perform t.as_user(guest);
  perform t.throws(format('select public.create_task(%L)', 'Gast taak'), 'forbidden', 'guests cannot create tasks');
  perform t.as_user(u1);
  perform public.delete_task(task);
  perform t.ok((select count(*) from public.tasks where id = task) = 0, 'the creator can delete a task');

  -- ===== knowledge base =====
  perform t.as_user(u1);
  perform t.throws(format('select public.save_kb_page(null, null, %L, %L)', 'Bedrijfsbeleid', 'tekst'), 'forbidden', 'only admins can write company pages');
  team_page := public.save_kb_page(null, tid, 'Release proces', 'Stap 1: testen', 'Proces');
  perform public.save_kb_page(team_page, null, 'Release proces', 'Stap 1: testen. Stap 2: uitrollen', 'Proces');
  perform t.ok((select count(*) from public.kb_versions where page_id = team_page) = 2, 'every change to a page keeps a version');
  perform public.save_kb_page(team_page, null, 'Release proces', 'Stap 1: testen. Stap 2: uitrollen', 'Handleiding');
  perform t.ok((select count(*) from public.kb_versions where page_id = team_page) = 2, 'changing only the category does not add a version');
  perform t.throws(format('select public.save_kb_page(null, %L, %L, %L)', tid, 'release proces', 'dubbel'), 'duplicate key', 'page titles are unique within a team');
  pinned_page := public.save_kb_page(null, tid, 'Vastgepind', 'x', null, true);
  perform t.ok((select pinned from public.kb_pages where id = pinned_page), 'a team owner can pin pages');
  perform t.as_user(u2);
  pinned_page := public.save_kb_page(null, tid, 'Niet vastgepind', 'x', null, true);
  perform t.ok((select pinned from public.kb_pages where id = pinned_page) = false, 'a plain member cannot pin pages');
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.kb_pages) = 0 and (select count(*) from public.kb_versions) = 0, 'outsiders cannot read team pages or their history');
  perform t.throws(format('select public.save_kb_page(%s, null, %L, %L)', team_page, 'Gehackt', 'x'), 'forbidden', 'outsiders cannot edit team pages');
  perform t.as_user(admin_id);
  page := public.save_kb_page(null, null, 'Bedrijfsbeleid', 'Welkom bij RAD');
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.kb_pages where team_id is null) = 1, 'everyone reads company pages');
  perform t.as_user(guest);
  perform t.ok((select count(*) from public.kb_pages) = 0, 'guests cannot read company pages');
  perform t.as_user(u2);
  perform t.throws(format('select public.delete_kb_page(%s)', team_page), 'forbidden', 'a plain member cannot delete pages');
  perform t.as_user(u1);
  perform public.delete_kb_page(team_page);
  perform t.ok((select count(*) from public.kb_pages where id = team_page) = 0, 'a team owner can delete pages');

  -- ===== meetings and decisions =====
  perform t.as_user(u2);
  meeting := public.save_meeting(null, tid, 'Sprint planning', now(), array[u1, u2], 'We kiezen scope.');
  dec := public.add_decision(meeting, 'We rollen donderdag uit.');
  perform public.add_decision(meeting, 'Geen code freeze.');
  perform t.ok((select count(*) from public.decisions where meeting_id = meeting) = 2, 'decisions are stored with the meeting');
  perform t.throws(format('select public.add_decision(%s, %L)', meeting, ''), 'invalid_text', 'a decision needs text');
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.meeting_notes) = 0 and (select count(*) from public.decisions) = 0, 'outsiders cannot read team meetings or decisions');
  perform t.throws(format('select public.add_decision(%s, %L)', meeting, 'Binnendringen'), 'forbidden', 'outsiders cannot add decisions');
  perform t.as_user(u1);
  perform t.ok((select count(*) from public.meeting_notes where id = meeting) = 1, 'team members read the meeting');
  perform public.save_meeting(meeting, null, 'Sprint planning (bijgewerkt)', null, null, null);
  perform t.ok((select title from public.meeting_notes where id = meeting) = 'Sprint planning (bijgewerkt)', 'a team owner can edit any meeting of the team');
  task := public.create_task('Uitrol voorbereiden', null, u2, null, tid, null, meeting);
  perform t.ok((select meeting_id from public.tasks where id = task) = meeting, 'an action item links back to its meeting');
  perform t.as_user(u2);
  perform public.delete_decision(dec);
  perform t.ok((select count(*) from public.decisions where meeting_id = meeting) = 1, 'the author can delete a decision');
  perform t.as_user(u1);
  perform public.delete_meeting(meeting);
  perform t.ok((select count(*) from public.meeting_notes where id = meeting) = 0 and (select count(*) from public.decisions) = 0, 'deleting a meeting removes its decisions');
end $test$;
