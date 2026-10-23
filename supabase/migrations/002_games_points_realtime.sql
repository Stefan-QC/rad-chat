-- RAD Chat part 2: points + leaderboards, Wordle (checked server-side), RAD Craft world,
-- activity sessions and Realtime authorization.

-- Accounts are created by an admin in Supabase (Authentication > Users), so the sign-up domain check is switched off.
update public.app_settings set value = '' where key = 'allowed_email_domain';

-- ---------- points ----------
create table public.point_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('wordle', 'craft')),
  points int not null check (points > 0),
  ref text not null, -- the day (YYYY-MM-DD) the points were earned
  created_at timestamptz not null default now(),
  unique (user_id, source, ref)
);
create index point_events_user_idx on public.point_events (user_id);
alter table public.point_events enable row level security;
create policy "points readable" on public.point_events for select to authenticated using (true);
revoke insert, update, delete on public.point_events from authenticated;

create view public.leaderboard_users with (security_invoker = true) as
select p.id as user_id, p.username, p.display_name, p.avatar_color,
       coalesce(sum(e.points), 0)::int as points,
       coalesce(sum(e.points) filter (where e.source = 'wordle'), 0)::int as wordle_points,
       coalesce(sum(e.points) filter (where e.source = 'craft'), 0)::int as craft_points
from public.profiles p left join public.point_events e on e.user_id = p.id
group by p.id;

create view public.leaderboard_teams with (security_invoker = true) as
select t.id as team_id, t.name, t.color,
       count(tm.user_id)::int as members,
       coalesce(sum(u.points), 0)::int as points
from public.teams t
left join public.team_members tm on tm.team_id = t.id
left join public.leaderboard_users u on u.user_id = tm.user_id
group by t.id;

-- ---------- activity sessions (voice calls, craft, wordle) ----------
create table public.activity_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('voice', 'craft', 'wordle')),
  ref text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index activity_sessions_user_idx on public.activity_sessions (user_id, started_at desc);
alter table public.activity_sessions enable row level security;
create policy "own sessions or admin" on public.activity_sessions for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());
revoke insert, update, delete on public.activity_sessions from authenticated;

create function public.start_activity(p_kind text, p_ref text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); sid bigint;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  update public.activity_sessions set ended_at = now() where user_id = me and kind = p_kind and ended_at is null;
  insert into public.activity_sessions (user_id, kind, ref) values (me, p_kind, p_ref) returning id into sid;
  perform private.audit(me, p_kind || '.start', 'activity', sid::text, jsonb_build_object('ref', p_ref));
  return sid;
end $$;

create function public.end_activity(p_id bigint) returns void language sql security definer set search_path = '' as $$
  update public.activity_sessions set ended_at = now() where id = p_id and user_id = (select auth.uid()) and ended_at is null;
$$;

-- ---------- Wordle ----------
create table public.wordle_words (word text primary key check (word ~ '^[a-z]{5}$'));
alter table public.wordle_words enable row level security; -- no policies: the list (and so the answer) never reaches clients

create table public.wordle_games (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  guesses text[] not null default '{}',
  status text not null default 'playing' check (status in ('playing', 'won', 'lost')),
  points int not null default 0,
  finished_at timestamptz,
  primary key (user_id, day)
);
alter table public.wordle_games enable row level security;
create policy "own wordle games" on public.wordle_games for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.wordle_games from authenticated;

create function private.wordle_today() returns date language sql stable as $$
  select (now() at time zone 'Europe/Amsterdam')::date;
$$;

-- Same word for everybody on the same date.
create function private.wordle_answer(d date) returns text language sql stable security definer set search_path = '' as $$
  select word from public.wordle_words order by word
  offset (abs(('x' || substr(md5(d::text), 1, 7))::bit(28)::int) % (select count(*) from public.wordle_words))::int limit 1;
$$;

-- Letters are only marked as often as they occur in the answer (two passes).
create function private.wordle_marks(guess text, answer text) returns text[] language plpgsql immutable as $$
declare res text[] := array_fill('absent'::text, array[5]); remaining jsonb := '{}'; i int; c text;
begin
  for i in 1..5 loop
    if substr(guess, i, 1) = substr(answer, i, 1) then res[i] := 'correct';
    else
      c := substr(answer, i, 1);
      remaining := jsonb_set(remaining, array[c], to_jsonb(coalesce((remaining->>c)::int, 0) + 1));
    end if;
  end loop;
  for i in 1..5 loop
    c := substr(guess, i, 1);
    if res[i] <> 'correct' and coalesce((remaining->>c)::int, 0) > 0 then
      res[i] := 'present';
      remaining := jsonb_set(remaining, array[c], to_jsonb((remaining->>c)::int - 1));
    end if;
  end loop;
  return res;
end $$;

create function public.wordle_state() returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); d date := private.wordle_today(); g public.wordle_games; ans text := private.wordle_answer(private.wordle_today());
begin
  select * into g from public.wordle_games where user_id = me and day = d;
  return jsonb_build_object(
    'day', d,
    'status', coalesce(g.status, 'playing'),
    'points', coalesce(g.points, 0),
    'guesses', coalesce((select jsonb_agg(jsonb_build_object('word', t.w, 'marks', to_jsonb(private.wordle_marks(t.w, ans))) order by t.ord)
                         from unnest(coalesce(g.guesses, '{}'::text[])) with ordinality as t(w, ord)), '[]'::jsonb),
    'answer', case when g.status in ('won', 'lost') then ans end);
end $$;

create function public.wordle_guess(p_word text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); d date := private.wordle_today(); ans text := private.wordle_answer(private.wordle_today());
  w text := lower(trim(p_word)); g public.wordle_games; n int; pts int;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if w !~ '^[a-z]{5}$' then raise exception 'invalid_length'; end if;
  if not exists (select 1 from public.wordle_words where word = w) then raise exception 'not_in_list'; end if;
  insert into public.wordle_games (user_id, day) values (me, d) on conflict do nothing;
  select * into g from public.wordle_games where user_id = me and day = d for update;
  if g.status <> 'playing' then raise exception 'game_over'; end if;
  n := coalesce(array_length(g.guesses, 1), 0) + 1;
  if w = ans then
    pts := (array[100, 80, 60, 45, 30, 20])[n];
    update public.wordle_games set guesses = g.guesses || w, status = 'won', points = pts, finished_at = now() where user_id = me and day = d;
    insert into public.point_events (user_id, source, points, ref) values (me, 'wordle', pts, d::text) on conflict do nothing;
    perform private.audit(me, 'wordle.won', 'wordle', d::text, jsonb_build_object('guesses', n, 'points', pts));
  elsif n >= 6 then
    update public.wordle_games set guesses = g.guesses || w, status = 'lost', finished_at = now() where user_id = me and day = d;
    perform private.audit(me, 'wordle.lost', 'wordle', d::text, jsonb_build_object('guesses', n));
  else
    update public.wordle_games set guesses = g.guesses || w where user_id = me and day = d;
  end if;
  return public.wordle_state();
end $$;

create function public.wordle_stats() returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); r record; played int := 0; wins int := 0; run int := 0; best int := 0;
  prev date; dist int[] := array[0, 0, 0, 0, 0, 0];
begin
  for r in select day, status, array_length(guesses, 1) as n from public.wordle_games
           where user_id = me and status in ('won', 'lost') order by day loop
    played := played + 1;
    if r.status = 'won' then
      wins := wins + 1;
      dist[r.n] := dist[r.n] + 1;
      run := case when prev is not null and r.day = prev + 1 then run + 1 else 1 end;
      best := greatest(best, run);
    else
      run := 0;
    end if;
    prev := r.day;
  end loop;
  if prev is not null and prev < private.wordle_today() - 1 then run := 0; end if;
  return jsonb_build_object('played', played, 'wins', wins, 'streak', run, 'max', best, 'dist', to_jsonb(dist));
end $$;

-- ---------- RAD Craft world ----------
create table public.craft_world (
  id int primary key default 1 check (id = 1),
  seed int not null default (floor(random() * 2147483647))::int
);
insert into public.craft_world default values;
alter table public.craft_world enable row level security;
create policy "world readable" on public.craft_world for select to authenticated using (true);

create table public.craft_blocks (
  x smallint not null, y smallint not null, z smallint not null,
  block_id smallint not null check (block_id between 0 and 10),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (x, y, z)
);
alter table public.craft_blocks enable row level security;
create policy "blocks readable" on public.craft_blocks for select to authenticated using (true);
revoke insert, update, delete on public.craft_blocks from authenticated;

create function public.craft_get_world() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'seed', (select seed from public.craft_world where id = 1),
    'size', 128, 'height', 64,
    'edits', coalesce((select jsonb_object_agg(x || ',' || y || ',' || z, block_id) from public.craft_blocks), '{}'::jsonb));
$$;

-- Placing or breaking a block earns 1 point, capped at 100 per day.
create function public.craft_set_block(p_x int, p_y int, p_z int, p_id int) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_x not between 0 and 127 or p_z not between 0 and 127 or p_y not between 1 and 63 or p_id not between 0 and 10 then
    raise exception 'invalid_block';
  end if;
  insert into public.craft_blocks (x, y, z, block_id, updated_by) values (p_x, p_y, p_z, p_id, me)
  on conflict (x, y, z) do update set block_id = excluded.block_id, updated_by = me, updated_at = now();
  insert into public.point_events (user_id, source, points, ref) values (me, 'craft', 1, private.wordle_today()::text)
  on conflict (user_id, source, ref) do update set points = least(public.point_events.points + 1, 100);
end $$;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.messages, public.point_events, public.profiles,
  public.teams, public.team_members, public.channels;

-- Broadcast/presence topics: 'lobby' and 'craft' for every signed-in user; 'voice:<channel id>' only for people who may access that channel.
create policy "realtime receive" on realtime.messages for select to authenticated using (
  case
    when realtime.topic() ~ '^voice:[0-9a-f-]{36}$' then private.can_access_channel(substr(realtime.topic(), 7)::uuid)
    else realtime.topic() in ('lobby', 'craft')
  end);
create policy "realtime send" on realtime.messages for insert to authenticated with check (
  case
    when realtime.topic() ~ '^voice:[0-9a-f-]{36}$' then private.can_access_channel(substr(realtime.topic(), 7)::uuid)
    else realtime.topic() in ('lobby', 'craft')
  end);

-- ---------- seed words + grants ----------
insert into public.wordle_words (word) values ('aarde'),('abdij'),('abuis'),('actie'),('adres'),('afval'),('agent'),('akker'),('alarm'),('album'),('alles'),('amper'),('angst'),('anker'),('appel'),('april'),('arena'),('armen'),('asiel'),('avond'),('baard'),('baken'),('balen'),('balie'),('banen'),('bange'),('barst'),('basis'),('beeld'),('beest'),('begin'),('beide'),('beker'),('bende'),('berge'),('beste'),('beter'),('beton'),('beurs'),('bezem'),('bezig'),('bijna'),('blaas'),('blauw'),('bleek'),('blijf'),('blind'),('bloed'),('bloem'),('blond'),('bocht'),('bodem'),('boden'),('boete'),('bogen'),('bolle'),('bonen'),('bonus'),('boord'),('boren'),('borst'),('bosje'),('braaf'),('brand'),('brede'),('breed'),('brein'),('brief'),('broer'),('brood'),('bruin'),('buren'),('busje'),('canon'),('carte'),('cavia'),('chaos'),('chips'),('clown'),('dader'),('dagen'),('daken'),('dalen'),('dames'),('datum'),('deken'),('delen'),('derde'),('deugd'),('dicht'),('dieet'),('dikke'),('diner'),('doden'),('dolle'),('doorn'),('draad'),('draak'),('drama'),('drank'),('dreun'),('droog'),('droom'),('druif'),('duren'),('dwaas'),('dwars'),('eigen'),('einde'),('eland'),('emmer'),('enkel'),('enorm'),('enter'),('ernst'),('etage'),('fiets'),('flauw'),('fleur'),('fluit'),('folie'),('fraai'),('frons'),('fruit'),('garde'),('gebed'),('geest'),('geluk'),('gemak'),('genot'),('getal'),('gezin'),('glans'),('goden'),('graad'),('graag'),('grens'),('grijs'),('groen'),('grond'),('groot'),('grote'),('haken'),('halen'),('halve'),('hamer'),('harde'),('haren'),('haven'),('heden'),('helft'),('hemel'),('heren'),('hobby'),('hoeve'),('hoger'),('holle'),('hoofd'),('hopen'),('horen'),('hotel'),('humor'),('hutje'),('idool'),('ijver'),('ijzer'),('imker'),('inzet'),('jacht'),('jager'),('jaren'),('jeugd'),('jonge'),('jubel'),('juist'),('kaars'),('kaart'),('kabel'),('kader'),('kaken'),('kalme'),('kamer'),('kanon'),('kapel'),('kasse'),('kerel'),('keren'),('keuze'),('kleed'),('klein'),('klont'),('kloof'),('kluis'),('knaap'),('knoop'),('kogel'),('koken'),('kolen'),('komen'),('komst'),('kopen'),('koper'),('korte'),('kraam'),('kraan'),('krans'),('krant'),('kreeg'),('kroeg'),('kroon'),('kruid'),('kruis'),('kudde'),('kunst'),('kwaad'),('kwart'),('laars'),('laden'),('lange'),('laten'),('leeuw'),('leger'),('lenen'),('lente'),('lepel'),('leren'),('leven'),('lezen'),('licht'),('lijst'),('linde'),('links'),('lopen'),('lucht'),('luide'),('lunch'),('maand'),('maken'),('malen'),('marge'),('markt'),('massa'),('menen'),('meter'),('molen'),('mooie'),('muren'),('naald'),('naast'),('nacht'),('nadat'),('namen'),('netto'),('niets'),('nieuw'),('nooit'),('noord'),('oefen'),('oever'),('offer'),('omdat'),('onder'),('opaal'),('opera'),('orgel'),('ouder'),('paard'),('paars'),('panne'),('parel'),('pauze'),('peren'),('piano'),('pioen'),('plaat'),('plank'),('plant'),('plein'),('ploeg'),('poort'),('potje'),('prijs'),('proef'),('pruim'),('radar'),('raden'),('raken'),('ramen'),('rapen'),('recht'),('reden'),('reeks'),('regen'),('rente'),('rijke'),('rijst'),('roept'),('roest'),('roken'),('rolle'),('roman'),('rozen'),('ruzie'),('saaie'),('samen'),('schat'),('schep'),('schip'),('serie'),('sinds'),('sjaal'),('slaap'),('slang'),('slijm'),('sluit'),('smaak'),('snoep'),('soort'),('sorry'),('spaar'),('spijt'),('spoor'),('sport'),('staan'),('staat'),('steek'),('steen'),('stier'),('stijl'),('stoel'),('stoep'),('storm'),('stuur'),('taart'),('tabak'),('tafel'),('talen'),('tante'),('tarwe'),('tegen'),('teken'),('tekst'),('tenen'),('terug'),('thema'),('thuis'),('titel'),('toets'),('tonen'),('toren'),('trein'),('trots'),('turen'),('uitje'),('vader'),('valse'),('vanaf'),('varen'),('vazen'),('verre'),('vlieg'),('vloer'),('vogel'),('volle'),('vorst'),('vrede'),('vrees'),('vroeg'),('vuile'),('vuist'),('waard'),('waken'),('wapen'),('warme'),('water'),('welke'),('weten'),('wezen'),('wijde'),('wijze'),('winst'),('woord'),('worst'),('wraak'),('wreed'),('zacht'),('zaken'),('zegen'),('zeker'),('zeven'),('zicht'),('zomer'),('zonde'),('zware'),('zwart'),('zwijn'),('zwoel');

revoke all on all tables in schema public from anon;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
