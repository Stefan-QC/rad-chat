-- Typing indicators: a Realtime broadcast topic 'typing:<channel id>' that only people with access to the channel can use.

drop policy "realtime receive" on realtime.messages;
drop policy "realtime send" on realtime.messages;

-- 'lobby' and 'craft' stay open to every signed-in user; 'voice:<id>' and 'typing:<id>' follow the channel access rules.
create policy "realtime receive" on realtime.messages for select to authenticated using (
  case
    when realtime.topic() ~ '^(voice|typing):[0-9a-f-]{36}$' then private.can_access_channel(substr(realtime.topic(), position(':' in realtime.topic()) + 1)::uuid)
    else realtime.topic() in ('lobby', 'craft')
  end);
create policy "realtime send" on realtime.messages for insert to authenticated with check (
  case
    when realtime.topic() ~ '^(voice|typing):[0-9a-f-]{36}$' then private.can_access_channel(substr(realtime.topic(), position(':' in realtime.topic()) + 1)::uuid)
    else realtime.topic() in ('lobby', 'craft')
  end);
