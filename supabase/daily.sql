-- Love Birds daily moments, themes and answer editing.
-- Run this once after schema.sql, notifications.sql and together.sql:
-- Dashboard > SQL Editor > New query > paste > Run. It is safe to run again.
--
-- Adds: Thinking of you taps, a daily mood, an evening rose, thorn and bud,
-- a photo of the day, a theme for each person, and changing today's answer once.
-- Like everything else in Love Birds, only the two of you can see your data.

-- ---------------------------------------------------------------------------
-- Profile: your theme
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists theme text not null default 'rose'
  check (theme in ('rose', 'steampunk', 'meadow', 'serengeti', 'diani', 'starry'));

grant update (name, push_token, bubble, heat, theme) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Changing today's answer once
-- ---------------------------------------------------------------------------

alter table public.answers add column if not exists edited_at timestamptz;

-- Changes your answer for a day, once. Only for today's question (or yesterday's,
-- for the hours when your phone and the server disagree about the date).
create or replace function public.edit_answer(p_day date, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
  v_partner_answered boolean;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'Write something first. Even one line is perfect.'; end if;
  if char_length(trim(p_body)) > 2000 then raise exception 'That answer is too long.'; end if;
  if p_day < current_date - 1 then raise exception 'You can only change today''s answer.'; end if;

  update public.answers set body = trim(p_body), edited_at = now()
  where couple_id = v_couple and day = p_day and user_id = auth.uid() and edited_at is null;
  if not found then raise exception 'You can only change your answer once.'; end if;

  select exists (
    select 1 from public.answers where couple_id = v_couple and day = p_day and user_id <> auth.uid()
  ) into v_partner_answered;
  if v_partner_answered then
    perform public.notify_partner(auth.uid(), 'Changed their answer to today''s question ✏️', '/question');
  end if;
end $$;

-- Same as before, plus when an answer was changed.
drop function if exists public.get_answers(date, date);
create function public.get_answers(p_from date, p_to date)
returns table (day date, question_id int, user_id uuid, body text, created_at timestamptz, edited_at timestamptz)
language sql stable security definer set search_path = public as $$
  with mine as (select public.my_couple_id() as cid),
  counts as (
    select a.day, count(*) as n
    from public.answers a, mine
    where a.couple_id = mine.cid and a.day between p_from and p_to
    group by a.day
  )
  select a.day, a.question_id, a.user_id,
         case when a.user_id = auth.uid() or c.n >= 2 then a.body else null end,
         a.created_at,
         a.edited_at
  from public.answers a
  join counts c on c.day = a.day
  cross join mine
  where a.couple_id = mine.cid and a.day between p_from and p_to
  order by a.day desc, a.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Thinking of you: one tap sends your partner a heartbeat.
create table if not exists public.nudges (
  id bigint generated always as identity primary key,
  couple_id uuid not null references public.couples on delete cascade,
  from_user uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists nudges_couple_created_idx on public.nudges (couple_id, created_at desc);

-- How you feel today. Your partner sees it straight away.
create table if not exists public.moods (
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  emoji text not null check (char_length(emoji) between 1 and 16),
  word text check (char_length(word) <= 40),
  updated_at timestamptz not null default now(),
  primary key (couple_id, user_id, day)
);

-- Rose (best part of the day), thorn (the hard part) and bud (something to look forward to).
-- Hidden from your partner until you've both shared.
create table if not exists public.checkins (
  couple_id uuid not null references public.couples on delete cascade,
  day date not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  rose text not null check (char_length(rose) between 1 and 500),
  thorn text check (char_length(thorn) <= 500),
  bud text check (char_length(bud) <= 500),
  created_at timestamptz not null default now(),
  primary key (couple_id, day, user_id)
);

-- One photo each per day. Your partner's shows once you've added yours.
create table if not exists public.daily_photos (
  couple_id uuid not null references public.couples on delete cascade,
  day date not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  photo_path text not null check (char_length(photo_path) <= 300),
  caption text check (char_length(caption) <= 140),
  created_at timestamptz not null default now(),
  primary key (couple_id, day, user_id)
);

-- ---------------------------------------------------------------------------
-- Privacy rules
-- ---------------------------------------------------------------------------

alter table public.nudges enable row level security;
alter table public.moods enable row level security;
alter table public.checkins enable row level security;
alter table public.daily_photos enable row level security;

-- Nudges are sent through send_nudge(). You both see them.
drop policy if exists "couple reads nudges" on public.nudges;
create policy "couple reads nudges" on public.nudges for select to authenticated
  using (couple_id = public.my_couple_id());

drop policy if exists "couple reads moods" on public.moods;
create policy "couple reads moods" on public.moods for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "set own mood" on public.moods;
create policy "set own mood" on public.moods for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());
drop policy if exists "change own mood" on public.moods;
create policy "change own mood" on public.moods for update to authenticated
  using (user_id = auth.uid() and couple_id = public.my_couple_id())
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());
revoke update on public.moods from anon, authenticated;
grant update (emoji, word, updated_at) on public.moods to authenticated;

-- Check-ins: read your own. Your partner's come through get_checkins().
drop policy if exists "read own checkins" on public.checkins;
create policy "read own checkins" on public.checkins for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "check in as yourself" on public.checkins;
create policy "check in as yourself" on public.checkins for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());
revoke update on public.checkins from anon, authenticated;

-- Photos of the day: read your own. Your partner's come through get_daily_photos().
-- You can swap your photo or caption on the same day.
drop policy if exists "read own daily photos" on public.daily_photos;
create policy "read own daily photos" on public.daily_photos for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "add own daily photo" on public.daily_photos;
create policy "add own daily photo" on public.daily_photos for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());
drop policy if exists "swap own daily photo" on public.daily_photos;
create policy "swap own daily photo" on public.daily_photos for update to authenticated
  using (user_id = auth.uid() and couple_id = public.my_couple_id())
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());
revoke update on public.daily_photos from anon, authenticated;
grant update (photo_path, caption) on public.daily_photos to authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Sends your partner a "thinking of you". Saved every time, but the phone only
-- buzzes once a minute at most, however many times you tap.
create or replace function public.send_nudge()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
  v_recent boolean;
begin
  if v_couple is null then raise exception 'Link with your partner first.'; end if;
  select exists (
    select 1 from public.nudges
    where couple_id = v_couple and from_user = auth.uid() and created_at > now() - interval '1 minute'
  ) into v_recent;
  insert into public.nudges (couple_id, from_user) values (v_couple, auth.uid());
  if not v_recent then
    perform public.notify_partner(auth.uid(), 'Thinking of you 💭', '/');
  end if;
end $$;

-- Check-ins between two dates. Your partner's rose, thorn and bud stay null
-- until you've shared yours for that day.
create or replace function public.get_checkins(p_from date, p_to date)
returns table (day date, user_id uuid, rose text, thorn text, bud text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  with who as (select auth.uid() as me, public.my_partner_id() as them, public.my_couple_id() as cid)
  select c.day, c.user_id,
         case when c.user_id = who.me or exists (
           select 1 from public.checkins m where m.couple_id = who.cid and m.day = c.day and m.user_id = who.me
         ) then c.rose end,
         case when c.user_id = who.me or exists (
           select 1 from public.checkins m where m.couple_id = who.cid and m.day = c.day and m.user_id = who.me
         ) then c.thorn end,
         case when c.user_id = who.me or exists (
           select 1 from public.checkins m where m.couple_id = who.cid and m.day = c.day and m.user_id = who.me
         ) then c.bud end,
         c.created_at
  from public.checkins c, who
  where c.couple_id = who.cid and c.user_id in (who.me, who.them) and c.day between p_from and p_to
  order by c.day desc, c.created_at;
$$;

-- Photos of the day between two dates. Your partner's photo and caption stay
-- null until you've added yours for that day.
create or replace function public.get_daily_photos(p_from date, p_to date)
returns table (day date, user_id uuid, photo_path text, caption text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  with who as (select auth.uid() as me, public.my_partner_id() as them, public.my_couple_id() as cid)
  select p.day, p.user_id,
         case when p.user_id = who.me or exists (
           select 1 from public.daily_photos m where m.couple_id = who.cid and m.day = p.day and m.user_id = who.me
         ) then p.photo_path end,
         case when p.user_id = who.me or exists (
           select 1 from public.daily_photos m where m.couple_id = who.cid and m.day = p.day and m.user_id = who.me
         ) then p.caption end,
         p.created_at
  from public.daily_photos p, who
  where p.couple_id = who.cid and p.user_id in (who.me, who.them) and p.day between p_from and p_to
  order by p.day desc, p.created_at;
$$;

revoke execute on function public.edit_answer(date, text) from public, anon;
revoke execute on function public.get_answers(date, date) from public, anon;
revoke execute on function public.send_nudge() from public, anon;
revoke execute on function public.get_checkins(date, date) from public, anon;
revoke execute on function public.get_daily_photos(date, date) from public, anon;
grant execute on function public.edit_answer(date, text) to authenticated;
grant execute on function public.get_answers(date, date) to authenticated;
grant execute on function public.send_nudge() to authenticated;
grant execute on function public.get_checkins(date, date) to authenticated;
grant execute on function public.get_daily_photos(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

-- A new mood (not every change during the day).
create or replace function public.on_mood_set()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner(
    new.user_id,
    'Feeling ' || new.emoji || coalesce(' ' || nullif(trim(new.word), ''), '') || ' today',
    '/'
  );
  return new;
end $$;

drop trigger if exists notify_mood on public.moods;
create trigger notify_mood after insert on public.moods
  for each row execute function public.on_mood_set();

-- A rose, thorn and bud. Never includes what was written.
create or replace function public.on_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_partner_done boolean;
begin
  select exists (
    select 1 from public.checkins where couple_id = new.couple_id and day = new.day and user_id <> new.user_id
  ) into v_partner_done;
  perform public.notify_partner(
    new.user_id,
    case when v_partner_done
      then 'Shared their rose, thorn and bud. Come and read both 🌹'
      else 'Shared their rose, thorn and bud. Share yours to read it 🌹'
    end,
    '/checkin'
  );
  return new;
end $$;

drop trigger if exists notify_checkin on public.checkins;
create trigger notify_checkin after insert on public.checkins
  for each row execute function public.on_checkin();

-- A photo of the day.
create or replace function public.on_daily_photo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_partner_done boolean;
begin
  select exists (
    select 1 from public.daily_photos where couple_id = new.couple_id and day = new.day and user_id <> new.user_id
  ) into v_partner_done;
  perform public.notify_partner(
    new.user_id,
    case when v_partner_done
      then 'Added their photo of the day. See both 📸'
      else 'Added their photo of the day. Add yours to see it 📸'
    end,
    '/photo-of-the-day'
  );
  return new;
end $$;

drop trigger if exists notify_daily_photo on public.daily_photos;
create trigger notify_daily_photo after insert on public.daily_photos
  for each row execute function public.on_daily_photo();

-- ---------------------------------------------------------------------------
-- Live updates for moods and Thinking of you
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'moods') then
    alter publication supabase_realtime add table public.moods;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nudges') then
    alter publication supabase_realtime add table public.nudges;
  end if;
end $$;
