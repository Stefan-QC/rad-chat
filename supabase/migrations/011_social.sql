-- Social: kudos, a daily quiz, badges, coffee matching and leaderboards for a period (for example this month).

alter table public.point_events drop constraint point_events_source_check;
alter table public.point_events add constraint point_events_source_check check (source in ('wordle', 'craft', 'kudos', 'quiz'));

-- ---------- kudos ----------
create table public.kudos (
  id bigint generated always as identity primary key,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 280),
  points int not null default 5 check (points between 1 and 5),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index kudos_from_idx on public.kudos (from_user, created_at desc);
create index kudos_to_idx on public.kudos (to_user, created_at desc);
alter table public.kudos enable row level security;
create policy "kudos are public inside the company" on public.kudos for select to authenticated using (private.is_active() and not private.is_guest());
revoke insert, update, delete on public.kudos from authenticated;

-- Everyone can give three kudos a day; the receiver gets 5 points and a notification.
create function public.give_kudos(p_to uuid, p_message text) returns bigint language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); kid bigint; giver text; text_body text := trim(coalesce(p_message, ''));
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if p_to = me then raise exception 'not_yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_to and deactivated_at is null and role <> 'guest') then raise exception 'invalid_user'; end if;
  if char_length(text_body) not between 1 and 280 then raise exception 'invalid_message'; end if;
  if (select count(*) from public.kudos where from_user = me and created_at >= date_trunc('day', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam') >= 3 then
    raise exception 'daily_limit';
  end if;
  insert into public.kudos (from_user, to_user, message) values (me, p_to, text_body) returning id into kid;
  insert into public.point_events (user_id, source, points, ref) values (p_to, 'kudos', 5, kid::text);
  select display_name into giver from public.profiles where id = me;
  perform private.notify(p_to, 'kudos', me, null, null, giver || ' gave you kudos', text_body, '/kudos');
  return kid;
end $$;

-- ---------- daily quiz ----------
create table public.quiz_questions (
  id int generated always as identity primary key,
  question text not null,
  options text[] not null check (array_length(options, 1) = 4),
  correct smallint not null check (correct between 0 and 3),
  category text
);
alter table public.quiz_questions enable row level security; -- the answers never leave the database
create table public.quiz_answers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  question_id int not null references public.quiz_questions(id) on delete cascade,
  chosen smallint not null check (chosen between 0 and 3),
  correct boolean not null,
  points int not null default 0,
  answered_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index quiz_answers_question_idx on public.quiz_answers (question_id);
alter table public.quiz_answers enable row level security;
create policy "own quiz answers" on public.quiz_answers for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.quiz_answers from authenticated;

create function private.quiz_question_for(d date) returns int language sql stable security definer set search_path = '' as $$
  select id from public.quiz_questions order by id
  offset (abs(('x' || substr(md5('quiz' || d::text), 1, 7))::bit(28)::int) % greatest((select count(*) from public.quiz_questions), 1))::int limit 1;
$$;

create function public.quiz_today() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); d date := private.wordle_today(); q public.quiz_questions; a public.quiz_answers;
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  select * into q from public.quiz_questions where id = private.quiz_question_for(d);
  if q.id is null then return jsonb_build_object('day', d, 'available', false); end if;
  select * into a from public.quiz_answers where user_id = me and day = d;
  return jsonb_build_object('day', d, 'available', true, 'question', q.question, 'options', to_jsonb(q.options), 'category', q.category,
    'answered', a.user_id is not null, 'chosen', a.chosen, 'correct', a.correct, 'points', coalesce(a.points, 0),
    'correct_index', case when a.user_id is not null then q.correct end);
end $$;

create function public.answer_quiz(p_choice smallint) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); d date := private.wordle_today(); q public.quiz_questions; ok boolean; pts int;
begin
  if me is null or not private.is_active() or private.is_guest() then raise exception 'forbidden'; end if;
  if p_choice not between 0 and 3 then raise exception 'invalid_choice'; end if;
  select * into q from public.quiz_questions where id = private.quiz_question_for(d);
  if q.id is null then raise exception 'no_question'; end if;
  if exists (select 1 from public.quiz_answers where user_id = me and day = d) then raise exception 'already_answered'; end if;
  ok := (p_choice = q.correct);
  pts := case when ok then 10 else 0 end;
  insert into public.quiz_answers (user_id, day, question_id, chosen, correct, points) values (me, d, q.id, p_choice, ok, pts);
  if ok then insert into public.point_events (user_id, source, points, ref) values (me, 'quiz', pts, d::text) on conflict do nothing; end if;
  return public.quiz_today();
end $$;

insert into public.quiz_questions (question, options, correct, category) values
  ('Wat is de hoofdstad van Australië?', array['Sydney', 'Canberra', 'Melbourne', 'Perth'], 1, 'Aardrijkskunde'),
  ('Hoeveel provincies heeft Nederland?', array['10', '11', '12', '13'], 2, 'Nederland'),
  ('Welke planeet staat het dichtst bij de zon?', array['Venus', 'Mars', 'Mercurius', 'Aarde'], 2, 'Wetenschap'),
  ('Wie schilderde ''De Nachtwacht''?', array['Vermeer', 'Rembrandt', 'Van Gogh', 'Mondriaan'], 1, 'Kunst'),
  ('Wat is de chemische formule van water?', array['CO2', 'H2O', 'O2', 'NaCl'], 1, 'Wetenschap'),
  ('In welk jaar viel de Berlijnse Muur?', array['1985', '1987', '1989', '1991'], 2, 'Geschiedenis'),
  ('Welke programmeertaal is vernoemd naar een Britse comedygroep?', array['Java', 'Python', 'Ruby', 'Perl'], 1, 'Techniek'),
  ('Hoeveel bits zitten er in een byte?', array['4', '8', '16', '32'], 1, 'Techniek'),
  ('Wat is de langste rivier van Europa?', array['Donau', 'Rijn', 'Wolga', 'Seine'], 2, 'Aardrijkskunde'),
  ('Welk dier is het symbool van het WWF?', array['Tijger', 'Panda', 'Olifant', 'Walvis'], 1, 'Natuur'),
  ('Hoeveel snaren heeft een standaard gitaar?', array['4', '5', '6', '7'], 2, 'Muziek'),
  ('Welke kleur krijg je door blauw en geel te mengen?', array['Groen', 'Paars', 'Oranje', 'Bruin'], 0, 'Kunst'),
  ('Wat is de grootste oceaan?', array['Atlantische', 'Indische', 'Stille', 'Noordelijke IJs'], 2, 'Aardrijkskunde'),
  ('Wie bedacht het World Wide Web?', array['Bill Gates', 'Tim Berners-Lee', 'Steve Jobs', 'Linus Torvalds'], 1, 'Techniek'),
  ('Wat is de wortel van 144?', array['10', '11', '12', '14'], 2, 'Rekenen'),
  ('Welke stad staat bekend om de Eiffeltoren?', array['Rome', 'Parijs', 'Londen', 'Berlijn'], 1, 'Aardrijkskunde'),
  ('Hoeveel spelers staan er per team op het veld bij voetbal?', array['9', '10', '11', '12'], 2, 'Sport'),
  ('Welk element heeft het symbool Au?', array['Zilver', 'Goud', 'Aluminium', 'Argon'], 1, 'Wetenschap'),
  ('Welke vorm heeft een stopbord?', array['Driehoek', 'Vierkant', 'Achthoek', 'Cirkel'], 2, 'Verkeer'),
  ('Wat is 15% van 200?', array['20', '25', '30', '35'], 2, 'Rekenen'),
  ('Welke gas ademen planten vooral in?', array['Zuurstof', 'Stikstof', 'Koolstofdioxide', 'Waterstof'], 2, 'Natuur'),
  ('Welke stad is de hoofdstad van Canada?', array['Toronto', 'Vancouver', 'Ottawa', 'Montreal'], 2, 'Aardrijkskunde'),
  ('Hoeveel dagen heeft een schrikkeljaar?', array['364', '365', '366', '367'], 2, 'Algemeen'),
  ('Wat betekent de afkorting HTML?', array['HyperText Markup Language', 'High Tech Modern Language', 'Hyper Transfer Mail Link', 'Home Tool Markup Level'], 0, 'Techniek'),
  ('Welke planeet staat bekend om zijn ringen?', array['Jupiter', 'Saturnus', 'Uranus', 'Mars'], 1, 'Wetenschap'),
  ('Welk land heeft de meeste inwoners?', array['Verenigde Staten', 'India', 'Indonesië', 'Brazilië'], 1, 'Aardrijkskunde'),
  ('Hoeveel minuten duurt een standaard voetbalwedstrijd (zonder extra tijd)?', array['80', '90', '100', '120'], 1, 'Sport'),
  ('Welke kleur heeft een banaan als die rijp is?', array['Groen', 'Geel', 'Rood', 'Blauw'], 1, 'Algemeen'),
  ('Wat is de hoogste berg ter wereld?', array['K2', 'Mont Blanc', 'Mount Everest', 'Kilimanjaro'], 2, 'Aardrijkskunde'),
  ('Welke taal is de officiële taal van Brazilië?', array['Spaans', 'Portugees', 'Engels', 'Frans'], 1, 'Taal');

-- ---------- badges ----------
create table public.badges (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null,
  sort smallint not null default 0
);
create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index user_badges_badge_idx on public.user_badges (badge_id);
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
create policy "badges are public" on public.badges for select to authenticated using (true);
create policy "earned badges are public inside the company" on public.user_badges for select to authenticated using (private.is_active() and not private.is_guest());
revoke insert, update, delete on public.badges, public.user_badges from authenticated;

insert into public.badges (id, name, description, icon, sort) values
  ('first_message', 'First words', 'Sent your first message', '💬', 1),
  ('chatterbox', 'Chatterbox', 'Sent 100 messages', '🗣️', 2),
  ('team_player', 'Team player', 'Joined a team', '🤝', 3),
  ('kudos_giver', 'Cheerleader', 'Gave kudos five times', '📣', 4),
  ('kudos_star', 'Shining star', 'Received kudos ten times', '🌟', 5),
  ('wordle_win', 'Word nerd', 'Won your first Wordle', '🔤', 6),
  ('wordle_streak', 'On a roll', 'Won Wordle seven days in a row', '🔥', 7),
  ('quiz_five', 'Quiz whiz', 'Answered five quiz questions correctly', '🧠', 8),
  ('craft_builder', 'Builder', 'Earned 100 points building in RAD Craft', '🧱', 9);

-- Checks every badge for one person and awards the ones they have earned; safe to call repeatedly.
create function private.award_badges(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare earned text[] := '{}'; badge text; label text;
begin
  if (select count(*) from (select 1 from public.messages where user_id = p_user limit 1) s) >= 1 then earned := array_append(earned, 'first_message'); end if;
  if (select count(*) from (select 1 from public.messages where user_id = p_user limit 100) s) >= 100 then earned := array_append(earned, 'chatterbox'); end if;
  if exists (select 1 from public.team_members where user_id = p_user) then earned := array_append(earned, 'team_player'); end if;
  if (select count(*) from public.kudos where from_user = p_user) >= 5 then earned := array_append(earned, 'kudos_giver'); end if;
  if (select count(*) from public.kudos where to_user = p_user) >= 10 then earned := array_append(earned, 'kudos_star'); end if;
  if exists (select 1 from public.wordle_games where user_id = p_user and status = 'won') then earned := array_append(earned, 'wordle_win'); end if;
  if coalesce((select max(run) from (select count(*) as run from (select day - (row_number() over (order by day))::int as grp from public.wordle_games where user_id = p_user and status = 'won') s group by grp) r), 0) >= 7 then
    earned := array_append(earned, 'wordle_streak');
  end if;
  if (select count(*) from public.quiz_answers where user_id = p_user and correct) >= 5 then earned := array_append(earned, 'quiz_five'); end if;
  if coalesce((select sum(points) from public.point_events where user_id = p_user and source = 'craft'), 0) >= 100 then earned := array_append(earned, 'craft_builder'); end if;
  foreach badge in array earned loop
    insert into public.user_badges (user_id, badge_id) values (p_user, badge) on conflict do nothing;
    if found then
      select name into label from public.badges where id = badge;
      perform private.notify(p_user, 'system', null, null, null, 'You earned a badge: ' || label, null, '/profile');
    end if;
  end loop;
end $$;

create function private.badges_after_activity() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'messages' then
    -- Alleen bij het eerste en het honderdste bericht is een controle nodig, zodat chatten snel blijft.
    if new.parent_id is null and (select count(*) from (select 1 from public.messages m where m.user_id = new.user_id limit 100) s) in (1, 100) then
      perform private.award_badges(new.user_id);
    end if;
  elsif tg_table_name = 'kudos' then
    perform private.award_badges(new.from_user);
    perform private.award_badges(new.to_user);
  else
    perform private.award_badges(new.user_id);
  end if;
  return new;
end $$;
create trigger badges_on_message after insert on public.messages for each row execute function private.badges_after_activity();
create trigger badges_on_kudos after insert on public.kudos for each row execute function private.badges_after_activity();
create trigger badges_on_team after insert on public.team_members for each row execute function private.badges_after_activity();
create trigger badges_on_quiz after insert on public.quiz_answers for each row when (new.correct) execute function private.badges_after_activity();
create trigger badges_on_points after insert or update on public.point_events for each row when (new.source = 'craft') execute function private.badges_after_activity();
create trigger badges_on_wordle after insert or update on public.wordle_games for each row when (new.status = 'won') execute function private.badges_after_activity();

-- ---------- coffee matching ----------
create table public.coffee_rounds (
  id bigint generated always as identity primary key,
  started_on date not null unique default current_date,
  created_at timestamptz not null default now()
);
create table public.coffee_pairs (
  round_id bigint not null references public.coffee_rounds(id) on delete cascade,
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  primary key (round_id, user_a, user_b),
  check (user_a < user_b)
);
create index coffee_pairs_user_b_idx on public.coffee_pairs (user_b);
create index coffee_pairs_user_a_idx on public.coffee_pairs (user_a);
create index coffee_pairs_channel_idx on public.coffee_pairs (channel_id);
alter table public.coffee_rounds enable row level security;
alter table public.coffee_pairs enable row level security;
create policy "rounds are visible" on public.coffee_rounds for select to authenticated using (private.is_active() and not private.is_guest());
create policy "my coffee pairs" on public.coffee_pairs for select to authenticated using (user_a = (select auth.uid()) or user_b = (select auth.uid()));
revoke insert, update, delete on public.coffee_rounds, public.coffee_pairs from authenticated;

-- ---------- leaderboards for a period ----------
create function public.leaderboard_users_period(p_from date, p_to date)
returns table (user_id uuid, username text, display_name text, avatar_color text, points int)
language sql stable set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_color, coalesce(sum(e.points), 0)::int
  from public.profiles p
  left join public.point_events e on e.user_id = p.id and e.created_at >= p_from and e.created_at < p_to
  where p.deactivated_at is null and p.role <> 'guest'
  group by p.id
  order by 5 desc, p.display_name
  limit 100;
$$;

create function public.leaderboard_teams_period(p_from date, p_to date)
returns table (team_id uuid, name text, color text, members int, points int)
language sql stable set search_path = '' as $$
  select t.id, t.name, t.color, count(distinct tm.user_id)::int, coalesce(sum(e.points), 0)::int
  from public.teams t
  left join public.team_members tm on tm.team_id = t.id
  left join public.point_events e on e.user_id = tm.user_id and e.created_at >= p_from and e.created_at < p_to
  group by t.id
  order by 5 desc, t.name;
$$;

alter publication supabase_realtime add table public.kudos, public.user_badges;

select private.lock_down_functions();
