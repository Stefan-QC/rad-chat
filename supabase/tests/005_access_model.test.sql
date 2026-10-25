-- Access model: DMs, groups, private channels, roles, guests and deactivated accounts.
do $test$
declare
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; u5 uuid;
  dm uuid; dm_again uuid; grp uuid; priv uuid; ann uuid; gen uuid; tid uuid;
begin
  perform t.make_user('seed_admin'); -- the first account is always an admin, so use it up
  u1 := t.make_user('uone'); u2 := t.make_user('utwo'); u3 := t.make_user('uthree', 'guest');
  u4 := t.make_user('ufour'); u5 := t.make_user('ufive', 'admin');
  update public.profiles set deactivated_at = now() where id = u4;
  select id into ann from public.channels where name = 'announcements';
  select id into gen from public.channels where name = 'general' and team_id is null;

  -- direct messages
  perform t.as_user(u1);
  dm := public.start_dm(u2);
  dm_again := public.start_dm(u2);
  perform t.ok(dm = dm_again, 'start_dm reuses the existing conversation');
  perform t.ok((select count(*) from public.channel_members where channel_id = dm) = 2, 'a DM has exactly two members');
  perform t.throws(format('select public.start_dm(%L)', u4), 'invalid_user', 'cannot DM a deactivated account');
  perform t.throws(format('select public.start_dm(%L)', u1), 'invalid_user', 'cannot DM yourself');

  -- groups and private channels
  grp := public.create_group('Project X', array[u2, u5]);
  perform t.ok((select count(*) from public.channel_members where channel_id = grp) = 3, 'a group has the creator and the invited members');
  perform t.throws(format('select public.create_group(%L, %L)', 'Solo', array[]::uuid[]), 'invalid_members', 'a group needs at least one other member');
  priv := public.create_private_channel('Geheim Plan', 'topic', null, array[u2]);
  perform t.ok((select name from public.channels where id = priv) = 'geheim-plan', 'private channel names become slugs');
  perform t.throws(format('select public.add_channel_member(%L, %L)', priv, u3), 'forbidden', 'a channel owner cannot invite a guest');

  -- posting rules
  perform t.throws(format('insert into public.messages (channel_id, user_id, body) values (%L, %L, %L)', ann, u1, 'x'), 'row-level security', 'members cannot post in an announcement channel');
  insert into public.messages (channel_id, user_id, body) values (gen, u1, 'hallo'), (dm, u1, 'hoi u2'), (priv, u1, 'geheim');
  perform t.throws(format('insert into public.messages (channel_id, user_id, body) values (%L, %L, %L)', gen, u2, 'gespoofd'), 'row-level security', 'cannot post as somebody else');
  perform public.set_channel_member_role(priv, u2, 'readonly');

  -- visibility for members, read-only members and outsiders
  perform t.as_user(u2);
  perform t.ok(private.can_access_channel(dm) and private.can_access_channel(grp) and private.can_access_channel(priv), 'invited members see DM, group and private channel');
  perform t.ok((select count(*) from public.messages where channel_id in (dm, priv)) = 2, 'members can read the messages');
  perform t.throws(format('insert into public.messages (channel_id, user_id, body) values (%L, %L, %L)', priv, u2, 'x'), 'row-level security', 'a read-only member cannot post');
  insert into public.messages (channel_id, user_id, body) values (dm, u2, 'hoi u1');
  perform t.throws(format('select public.remove_channel_member(%L, %L)', grp, u1), 'forbidden', 'a plain member cannot remove the owner');

  -- guests
  perform t.as_user(u3);
  perform t.ok((select count(*) from public.channels where team_id is null and not is_private) = 0, 'a guest sees no company channels');
  perform t.ok(not private.can_access_channel(dm) and (select count(*) from public.messages) = 0, 'a guest sees no messages');
  perform t.throws(format('select public.start_dm(%L)', u1), 'forbidden', 'a guest cannot start a DM');
  perform t.throws(format('select public.create_team(%L)', 'Guest Team'), 'forbidden', 'a guest cannot create a team');

  -- deactivated accounts
  perform t.as_user(u4);
  perform t.ok((select count(*) from public.channels) = 0 and (select count(*) from public.messages) = 0, 'a deactivated account sees nothing');

  -- admins
  perform t.as_user(u5);
  insert into public.messages (channel_id, user_id, body) values (ann, u5, 'aankondiging');
  perform t.ok(true, 'an admin can post in an announcement channel');
  perform t.ok(not private.can_access_channel(dm) and not private.can_access_channel(priv), 'an admin cannot read private DMs or channels of others');

  -- leaving a group hands over ownership
  perform t.as_user(u1);
  perform public.leave_channel(grp);
  perform t.as_owner();
  perform t.ok((select count(*) from public.channel_members where channel_id = grp and role = 'owner') = 1, 'ownership moves to another member when the owner leaves');
  perform t.as_user(u1);
  perform t.throws(format('select public.leave_channel(%L)', dm), 'forbidden', 'a DM cannot be left');

  -- team roles
  tid := public.create_team('Team T');
  perform t.as_user(u2);
  perform public.join_team(tid);
  perform t.as_user(u1);
  perform public.set_team_member_role(tid, u2, 'moderator');
  perform t.ok((select role from public.team_members where team_id = tid and user_id = u2) = 'moderator', 'a team owner can promote a moderator');
  perform t.as_user(u2);
  perform t.throws(format('select public.remove_team_member(%L, %L)', tid, u1), 'forbidden', 'a moderator cannot remove the owner');
  perform t.as_user(u3);
  perform t.throws(format('select public.join_team(%L)', tid), 'forbidden', 'a guest cannot join a team');

  perform t.as_owner();
  perform t.ok((select count(*) from public.audit_logs where action in ('channel.create_group', 'channel.create_private', 'team.create', 'team.role')) = 4, 'channel and team changes are audited');
end $test$;
