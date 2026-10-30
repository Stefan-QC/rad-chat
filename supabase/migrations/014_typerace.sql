-- Type race: multiplayer typing lobbies with a server-side state machine (lobby -> countdown -> playing -> finished).
-- All timing comes from the database clock; clients only send validated progress reports.

-- ---------- words (only the server reads them) ----------
create table public.typerace_words (
  language text not null check (language in ('nl', 'en')),
  word text not null check (word ~ '^[a-z]{2,14}$'),
  primary key (language, word)
);
alter table public.typerace_words enable row level security;

insert into public.typerace_words (language, word) select 'en', w from unnest(string_to_array(
  'time year people way day man thing woman life child world school state family student group country problem hand part place case week company system program question work government number night point home water room mother area money story fact month lot right study book eye job word business issue side kind head house service friend father power hour game line end member law car city community name team minute idea body information back parent face others level office door health person art war history party result change morning reason research girl guy moment air teacher force education foot boy age policy music market sense nation plan college interest death experience effect class control care field development role effort rate heart drug show leader light voice wife police mind price report decision son view relationship town road arm difference value building action model season society tax director position player record paper space ground form event official matter center couple site project activity star table need court oil situation cost industry figure street image phone data picture practice piece land product doctor wall patient worker news test movie north love support technology step baby computer type attention film tree source organization hair window culture chance brother energy period course summer plant opportunity term letter condition choice', ' ')) as w
on conflict do nothing;

insert into public.typerace_words (language, word) select 'nl', w from unnest(string_to_array(
  'tijd jaar mensen dag hand huis werk leven kind stad land water vriend school nacht licht vader moeder familie groep vraag probleem begin einde plaats deel reden manier verhaal wereld straat kamer tafel stoel deur raam tuin boom bloem vogel paard hond kat vis brood melk koffie thee kaas fiets auto trein bus vliegtuig schip boot weg brug berg zee strand regen wind zon maan ster wolk sneeuw winter zomer lente herfst maand week uur minuut morgen middag avond gisteren vandaag spreken lopen werken wonen denken geven nemen maken komen gaan zien horen voelen weten willen moeten kunnen zeggen vragen vinden laten staan zitten liggen eten drinken slapen spelen lezen schrijven leren kopen betalen verkopen bellen sturen halen brengen helpen zoeken kiezen beginnen stoppen wachten vergeten onthouden beloven proberen gebruiken veranderen groot klein lang kort oud nieuw jong mooi lelijk snel langzaam sterk zwak warm koud blij boos moe ziek gezond rijk arm vol leeg open dicht zwaar donker helder zacht hard dik dun breed smal hoog laag diep nat droog schoon vies lekker zout zoet zuur bitter vrij druk rustig stil luid vriendelijk belangrijk moeilijk makkelijk gevaarlijk veilig', ' ')) as w
on conflict do nothing;

-- ---------- lobbies, players and results ----------
create table public.typerace_lobbies (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  language text not null default 'en' check (language in ('nl', 'en')),
  duration_seconds int not null default 30 check (duration_seconds in (15, 30, 60)),
  status text not null default 'lobby' check (status in ('lobby', 'countdown', 'playing', 'finished')),
  round int not null default 0,
  text text,
  countdown_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index typerace_lobbies_host_idx on public.typerace_lobbies (host_id);

-- play_from is the first round a player takes part in; someone who joins during a round waits for the next one.
create table public.typerace_players (
  lobby_id uuid not null references public.typerace_lobbies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  play_from int not null,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (lobby_id, user_id)
);
create unique index typerace_players_user_idx on public.typerace_players (user_id); -- one lobby at a time

create table public.typerace_results (
  lobby_id uuid not null references public.typerace_lobbies(id) on delete cascade,
  round int not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  correct_chars int not null check (correct_chars >= 0),
  keystrokes int not null check (keystrokes >= 0),
  correct_keystrokes int not null check (correct_keystrokes >= 0),
  wpm numeric(6, 1) not null default 0,
  accuracy numeric(5, 1) not null default 100,
  progress numeric(5, 1) not null default 0,
  finished boolean not null default false,
  finished_ms int,
  updated_at timestamptz not null default now(),
  primary key (lobby_id, round, user_id)
);
create index typerace_results_user_idx on public.typerace_results (user_id);

alter table public.typerace_lobbies enable row level security;
alter table public.typerace_players enable row level security;
alter table public.typerace_results enable row level security;
create policy "lobbies are visible inside the company" on public.typerace_lobbies for select to authenticated using (private.is_active() and not private.is_guest());
create policy "players are visible inside the company" on public.typerace_players for select to authenticated using (private.is_active() and not private.is_guest());
create policy "results are visible inside the company" on public.typerace_results for select to authenticated using (private.is_active() and not private.is_guest());
revoke insert, update, delete on public.typerace_lobbies, public.typerace_players, public.typerace_results from authenticated;

-- ---------- helpers ----------
-- A sentence-like text of p_words random words, with capitals, commas and full stops so every kind of key is practised.
create function private.typerace_text(p_language text, p_words int) returns text language plpgsql volatile security definer set search_path = '' as $$
declare w text; result text := ''; i int; sentence_len int := 5 + floor(random() * 8)::int; in_sentence int := 0; capitalise boolean := true;
begin
  for i in 1..p_words loop
    select word into w from public.typerace_words where language = p_language order by random() limit 1;
    if capitalise then w := upper(left(w, 1)) || substr(w, 2); capitalise := false; end if;
    in_sentence := in_sentence + 1;
    if i = p_words or in_sentence >= sentence_len then
      w := w || '.';
      in_sentence := 0;
      sentence_len := 5 + floor(random() * 8)::int;
      capitalise := true;
    elsif random() < 0.08 then
      w := w || ',';
    end if;
    result := result || case when result = '' then '' else ' ' end || w;
  end loop;
  return result;
end $$;

-- Moves a lobby forward when its time has come: countdown -> playing -> finished. Safe to call as often as you like.
create function private.typerace_advance(p_lobby uuid) returns void language plpgsql security definer set search_path = '' as $$
declare l public.typerace_lobbies; participants int; done int;
begin
  select * into l from public.typerace_lobbies where id = p_lobby for update;
  if not found then return; end if;
  if l.status = 'countdown' and now() >= l.starts_at then
    update public.typerace_lobbies set status = 'playing', updated_at = now() where id = l.id;
    l.status := 'playing';
  end if;
  if l.status = 'playing' then
    select count(*) into participants from public.typerace_players where lobby_id = l.id and play_from <= l.round;
    select count(*) into done from public.typerace_results r
      where r.lobby_id = l.id and r.round = l.round and r.finished
        and exists (select 1 from public.typerace_players p where p.lobby_id = l.id and p.user_id = r.user_id and p.play_from <= l.round);
    -- a short grace period after the end lets the last reports arrive
    if now() >= l.ends_at + interval '2 seconds' or participants = 0 or done >= participants then
      update public.typerace_lobbies set status = 'finished', finished_at = now(), updated_at = now() where id = l.id;
    end if;
  end if;
end $$;

-- Removes a player; the lobby disappears when it is empty and the host role moves on when the host leaves.
create function private.typerace_remove_player(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare lid uuid;
begin
  delete from public.typerace_players where user_id = p_user returning lobby_id into lid;
  if lid is null then return; end if;
  if not exists (select 1 from public.typerace_players where lobby_id = lid) then
    delete from public.typerace_lobbies where id = lid;
    return;
  end if;
  update public.typerace_lobbies
    set host_id = (select user_id from public.typerace_players where lobby_id = lid order by joined_at, user_id limit 1), updated_at = now()
    where id = lid and host_id = p_user;
  perform private.typerace_advance(lid);
end $$;

-- Drops players who stopped sending heartbeats, and lobbies that are left empty or without their host.
create function private.typerace_prune() returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select user_id from public.typerace_players where last_seen < now() - interval '30 seconds' loop
    perform private.typerace_remove_player(r.user_id);
  end loop;
  delete from public.typerace_lobbies l where not exists (select 1 from public.typerace_players p where p.lobby_id = l.id);
end $$;

-- Realtime topics: 'lobby' and 'craft' for everybody, 'voice:<id>' and 'typing:<id>' follow channel access, 'typerace:<id>' is for the players of that lobby.
create function private.can_use_topic(t text) returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when t ~ '^(voice|typing):[0-9a-f-]{36}$' then private.can_access_channel(substr(t, position(':' in t) + 1)::uuid)
    when t ~ '^typerace:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
      select 1 from public.typerace_players p where p.lobby_id = substr(t, 10)::uuid and p.user_id = (select auth.uid()))
    else coalesce(t in ('lobby', 'craft'), false)
  end;
$$;
grant execute on function private.can_use_topic(text) to authenticated;

drop policy "realtime receive" on realtime.messages;
drop policy "realtime send" on realtime.messages;
create policy "realtime receive" on realtime.messages for select to authenticated using (private.can_use_topic(realtime.topic()));
create policy "realtime send" on realtime.messages for insert to authenticated with check (private.can_use_topic(realtime.topic()));

-- ---------- public functions ----------
create function public.typerace_open_lobbies() returns table (lobby_id uuid, host_id uuid, language text, duration_seconds int, status text, players int)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  perform private.typerace_prune();
  return query
    select l.id, l.host_id, l.language, l.duration_seconds, l.status, (select count(*)::int from public.typerace_players p where p.lobby_id = l.id)
    from public.typerace_lobbies l order by l.created_at desc limit 30;
end $$;

create function public.typerace_create(p_language text default 'en', p_duration int default 30) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); lid uuid;
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if p_language not in ('nl', 'en') then raise exception 'invalid_language'; end if;
  if p_duration not in (15, 30, 60) then raise exception 'invalid_duration'; end if;
  perform private.typerace_remove_player(me);
  insert into public.typerace_lobbies (host_id, language, duration_seconds) values (me, p_language, p_duration) returning id into lid;
  insert into public.typerace_players (lobby_id, user_id, play_from) values (lid, me, 1);
  return lid;
end $$;

create function public.typerace_join(p_lobby uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); l public.typerace_lobbies;
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  perform private.typerace_prune();
  select * into l from public.typerace_lobbies where id = p_lobby for update;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from public.typerace_players where lobby_id = p_lobby and user_id = me) then
    update public.typerace_players set last_seen = now() where lobby_id = p_lobby and user_id = me;
    return;
  end if;
  if (select count(*) from public.typerace_players where lobby_id = p_lobby) >= 8 then raise exception 'lobby_full'; end if;
  perform private.typerace_remove_player(me);
  insert into public.typerace_players (lobby_id, user_id, play_from) values (p_lobby, me, l.round + 1);
end $$;

create function public.typerace_leave() returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'forbidden'; end if;
  perform private.typerace_remove_player((select auth.uid()));
end $$;

create function public.typerace_settings(p_lobby uuid, p_language text, p_duration int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); l public.typerace_lobbies;
begin
  select * into l from public.typerace_lobbies where id = p_lobby for update;
  if not found or l.host_id is distinct from me then raise exception 'forbidden'; end if;
  if l.status not in ('lobby', 'finished') then raise exception 'round_in_progress'; end if;
  if p_language not in ('nl', 'en') then raise exception 'invalid_language'; end if;
  if p_duration not in (15, 30, 60) then raise exception 'invalid_duration'; end if;
  update public.typerace_lobbies set language = p_language, duration_seconds = p_duration, updated_at = now() where id = p_lobby;
end $$;

-- Only the host can start; a second start while a round is running is refused. The countdown lasts 3 seconds.
create function public.typerace_start(p_lobby uuid) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); l public.typerace_lobbies; words int;
begin
  select * into l from public.typerace_lobbies where id = p_lobby for update;
  if not found or l.host_id is distinct from me then raise exception 'forbidden'; end if;
  perform private.typerace_advance(p_lobby);
  select * into l from public.typerace_lobbies where id = p_lobby;
  if l.status not in ('lobby', 'finished') then raise exception 'round_in_progress'; end if;
  words := ceil(l.duration_seconds * 1.7)::int;
  update public.typerace_lobbies set
    status = 'countdown', round = l.round + 1, text = private.typerace_text(l.language, words),
    countdown_at = now(), starts_at = now() + interval '3 seconds', ends_at = now() + interval '3 seconds' + make_interval(secs => l.duration_seconds),
    finished_at = null, updated_at = now()
    where id = p_lobby;
end $$;

-- Heartbeat, state machine step and server time in one call. Clients call it every few seconds and at the moments a phase changes.
create function public.typerace_sync(p_lobby uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); l public.typerace_lobbies; present boolean;
begin
  if me is null then raise exception 'forbidden'; end if;
  update public.typerace_players set last_seen = now() where lobby_id = p_lobby and user_id = me;
  perform private.typerace_prune();
  perform private.typerace_advance(p_lobby);
  select * into l from public.typerace_lobbies where id = p_lobby;
  present := exists (select 1 from public.typerace_players where lobby_id = p_lobby and user_id = me);
  return jsonb_build_object('server_now', now(), 'in_lobby', present and l.id is not null, 'status', l.status, 'round', l.round);
end $$;

-- A player reports their progress. The server recomputes WPM, accuracy and progress and refuses impossible numbers.
-- WPM counts 5 characters as a word: correct characters (letters of fully correct words plus the space after them) / 5 / minutes.
-- Accuracy is correct keystrokes / all character keystrokes; Backspace is not counted, and a corrected mistake still costs accuracy.
create function public.typerace_report(p_lobby uuid, p_round int, p_correct_chars int, p_keystrokes int, p_correct_keystrokes int, p_finished boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); l public.typerace_lobbies; elapsed numeric; len int;
  finished_ms int; speed numeric; acc numeric; prog numeric; existing public.typerace_results;
begin
  if me is null or not private.is_active() then raise exception 'forbidden'; end if;
  perform private.typerace_advance(p_lobby);
  select * into l from public.typerace_lobbies where id = p_lobby;
  if not found or l.round is distinct from p_round then raise exception 'invalid_round'; end if;
  if not exists (select 1 from public.typerace_players where lobby_id = p_lobby and user_id = me and play_from <= l.round) then raise exception 'not_a_participant'; end if;
  if l.status = 'countdown' or now() < l.starts_at then raise exception 'not_started'; end if;
  if l.status = 'finished' or now() > l.ends_at + interval '2 seconds' then raise exception 'round_over'; end if;
  len := char_length(l.text);
  if p_correct_chars < 0 or p_correct_chars > len or p_keystrokes < 0 or p_correct_keystrokes < 0
     or p_correct_keystrokes > p_keystrokes or p_correct_chars > p_correct_keystrokes then raise exception 'invalid_report'; end if;
  elapsed := least(extract(epoch from now() - l.starts_at), l.duration_seconds);
  -- about 30 keystrokes per second is beyond what any human types
  if p_keystrokes > (elapsed + 1) * 30 then raise exception 'invalid_report'; end if;
  if p_finished and p_correct_chars <> len then raise exception 'invalid_report'; end if;

  select * into existing from public.typerace_results where lobby_id = p_lobby and round = p_round and user_id = me;
  if found and existing.finished then return; end if;

  speed := round(p_correct_chars / 5.0 / (greatest(elapsed, 1) / 60.0), 1);
  acc := case when p_keystrokes = 0 then 100 else round(100.0 * p_correct_keystrokes / p_keystrokes, 1) end;
  prog := round(100.0 * p_correct_chars / len, 1);
  finished_ms := case when p_finished then floor(elapsed * 1000)::int end;
  if speed > 400 then raise exception 'invalid_report'; end if;

  insert into public.typerace_results (lobby_id, round, user_id, correct_chars, keystrokes, correct_keystrokes, wpm, accuracy, progress, finished, finished_ms)
  values (p_lobby, p_round, me, p_correct_chars, p_keystrokes, p_correct_keystrokes, speed, acc, prog, p_finished, finished_ms)
  on conflict (lobby_id, round, user_id) do update set
    correct_chars = excluded.correct_chars, keystrokes = excluded.keystrokes, correct_keystrokes = excluded.correct_keystrokes,
    wpm = excluded.wpm, accuracy = excluded.accuracy, progress = excluded.progress, finished = excluded.finished,
    finished_ms = excluded.finished_ms, updated_at = now();
  if p_finished then perform private.typerace_advance(p_lobby); end if;
end $$;

alter publication supabase_realtime add table public.typerace_lobbies, public.typerace_players, public.typerace_results;

select private.lock_down_functions();
