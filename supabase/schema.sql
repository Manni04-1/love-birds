-- Love Birds database setup.
-- Run this once in your Supabase project: Dashboard > SQL Editor > New query > paste > Run.
-- Every table is private to the couple that owns it. Nobody else can read it.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique,
  invite_expires_at timestamptz,
  together_since date,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  couple_id uuid references public.couples on delete set null,
  created_at timestamptz not null default now()
);
create index profiles_couple_idx on public.profiles (couple_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  day date not null,
  time time,
  note text check (char_length(note) <= 500),
  remind boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index events_couple_day_idx on public.events (couple_id, day);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text check (char_length(body) <= 4000),
  image_path text,
  hearted boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (body is not null or image_path is not null)
);
create index messages_couple_created_idx on public.messages (couple_id, created_at desc);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  happened_on date not null default current_date,
  caption text not null check (char_length(caption) between 1 and 1000),
  place text check (char_length(place) <= 120),
  photo_path text,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index memories_couple_day_idx on public.memories (couple_id, happened_on desc);

create table public.memory_loves (
  memory_id uuid not null references public.memories on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (memory_id, user_id)
);

create table public.questions (
  id int generated always as identity primary key,
  text text not null
);

create table public.answers (
  couple_id uuid not null references public.couples on delete cascade,
  day date not null,
  question_id int not null references public.questions,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  primary key (couple_id, day, user_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The couple the signed-in person belongs to (null if not linked yet).
create or replace function public.my_couple_id()
returns uuid language sql stable security definer set search_path = public as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

-- Every new account gets a profile, using the name given at sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'You'));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privacy rules (row level security)
-- ---------------------------------------------------------------------------

alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.memory_loves enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;

-- Profiles: you see yourself and your partner. You can only rename yourself.
create policy "see self and partner" on public.profiles for select to authenticated
  using (id = auth.uid() or (couple_id is not null and couple_id = public.my_couple_id()));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;

-- Couples: you see your own couple and can change the together-since date.
-- Couples are only created or joined through the functions further down.
create policy "see own couple" on public.couples for select to authenticated
  using (id = public.my_couple_id());
create policy "edit own couple" on public.couples for update to authenticated
  using (id = public.my_couple_id()) with check (id = public.my_couple_id());
revoke update on public.couples from anon, authenticated;
grant update (together_since) on public.couples to authenticated;

-- Calendar
create policy "couple reads plans" on public.events for select to authenticated
  using (couple_id = public.my_couple_id());
create policy "couple adds plans" on public.events for insert to authenticated
  with check (couple_id = public.my_couple_id() and created_by = auth.uid());
create policy "couple edits plans" on public.events for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
create policy "couple deletes plans" on public.events for delete to authenticated
  using (couple_id = public.my_couple_id());

-- Messages: both read; you send as yourself; either can heart or mark read.
create policy "couple reads messages" on public.messages for select to authenticated
  using (couple_id = public.my_couple_id());
create policy "send as yourself" on public.messages for insert to authenticated
  with check (couple_id = public.my_couple_id() and sender_id = auth.uid());
create policy "heart or mark read" on public.messages for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
revoke update on public.messages from anon, authenticated;
grant update (hearted, read_at) on public.messages to authenticated;

-- Memories: both read; each edits or deletes their own.
create policy "couple reads memories" on public.memories for select to authenticated
  using (couple_id = public.my_couple_id());
create policy "couple adds memories" on public.memories for insert to authenticated
  with check (couple_id = public.my_couple_id() and created_by = auth.uid());
create policy "edit own memories" on public.memories for update to authenticated
  using (created_by = auth.uid()) with check (couple_id = public.my_couple_id());
create policy "delete own memories" on public.memories for delete to authenticated
  using (created_by = auth.uid());

create policy "couple sees loves" on public.memory_loves for select to authenticated
  using (exists (select 1 from public.memories m where m.id = memory_id and m.couple_id = public.my_couple_id()));
create policy "love a memory" on public.memory_loves for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.memories m where m.id = memory_id and m.couple_id = public.my_couple_id()));
create policy "unlove a memory" on public.memory_loves for delete to authenticated
  using (user_id = auth.uid());

-- Questions are shared by everyone.
create policy "anyone signed in reads questions" on public.questions for select to authenticated using (true);

-- Answers: you can read only your own directly. Your partner's answer comes
-- through get_answers(), which hides it until you have both answered.
create policy "read own answers" on public.answers for select to authenticated
  using (user_id = auth.uid());
create policy "answer as yourself" on public.answers for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Start a couple (or get a fresh code) and return a 6-character invite code.
create or replace function public.create_couple()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid;
  v_code text;
  v_members int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select couple_id into v_couple from public.profiles where id = auth.uid();
  if v_couple is not null then
    select count(*) into v_members from public.profiles where couple_id = v_couple;
    if v_members >= 2 then raise exception 'You are already linked with your partner.'; end if;
  end if;

  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.couples where invite_code = v_code);
  end loop;

  if v_couple is null then
    insert into public.couples (invite_code, invite_expires_at, created_by)
    values (v_code, now() + interval '24 hours', auth.uid())
    returning id into v_couple;
    update public.profiles set couple_id = v_couple where id = auth.uid();
  else
    update public.couples set invite_code = v_code, invite_expires_at = now() + interval '24 hours'
    where id = v_couple;
  end if;

  return v_code;
end $$;

-- Join your partner with their invite code.
create or replace function public.join_couple(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid;
  v_mine uuid;
  v_members int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select id into v_couple from public.couples
  where invite_code = upper(trim(p_code)) and invite_expires_at > now()
  for update;
  if v_couple is null then
    raise exception 'That code is wrong or has expired. Ask your partner for a new one.';
  end if;

  select couple_id into v_mine from public.profiles where id = auth.uid();
  if v_mine = v_couple then return v_couple; end if;

  select count(*) into v_members from public.profiles where couple_id = v_couple;
  if v_members >= 2 then raise exception 'That couple already has two people.'; end if;

  -- If you had started your own couple and nobody joined it, remove it.
  if v_mine is not null then
    update public.profiles set couple_id = null where id = auth.uid();
    delete from public.couples c
    where c.id = v_mine and not exists (select 1 from public.profiles p where p.couple_id = v_mine);
  end if;

  update public.profiles set couple_id = v_couple where id = auth.uid();
  update public.couples set invite_code = null, invite_expires_at = null where id = v_couple;
  return v_couple;
end $$;

-- Leave your couple. Your partner keeps the shared history.
create or replace function public.unlink_couple()
returns void language sql security definer set search_path = public as $$
  update public.profiles set couple_id = null where id = auth.uid();
$$;

-- Answers between two dates. Your partner's answer for a day stays hidden
-- (body is null) until you have both answered that day.
create or replace function public.get_answers(p_from date, p_to date)
returns table (day date, question_id int, user_id uuid, body text, created_at timestamptz)
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
         a.created_at
  from public.answers a
  join counts c on c.day = a.day
  cross join mine
  where a.couple_id = mine.cid and a.day between p_from and p_to
  order by a.day desc, a.created_at;
$$;

-- Delete your account and everything that belongs only to you.
create or replace function public.delete_my_account()
returns void language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.create_couple() from public, anon;
revoke execute on function public.join_couple(text) from public, anon;
revoke execute on function public.unlink_couple() from public, anon;
revoke execute on function public.get_answers(date, date) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.create_couple() to authenticated;
grant execute on function public.join_couple(text) to authenticated;
grant execute on function public.unlink_couple() to authenticated;
grant execute on function public.get_answers(date, date) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Photos (private storage, one folder per couple)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "couple reads photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple_id()::text);
create policy "couple adds photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple_id()::text);

-- ---------------------------------------------------------------------------
-- Live updates for chat, calendar and memories
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages, public.events, public.memories;

-- ---------------------------------------------------------------------------
-- Daily questions (one per day, the same for every couple)
-- ---------------------------------------------------------------------------

insert into public.questions (text) values
  ('What''s one small thing I do that makes you feel loved?'),
  ('What''s a habit of mine you secretly love?'),
  ('Where would you take me if money didn''t matter?'),
  ('What song reminds you of us?'),
  ('What''s your favourite memory of our first month together?'),
  ('What''s something you''ve never told me but want to?'),
  ('When do you feel closest to me?'),
  ('What''s one thing you''d like us to try together this year?'),
  ('What made you first notice me?'),
  ('What''s a meal that always reminds you of us?'),
  ('What do you think our life looks like in five years?'),
  ('What''s the best advice about love you''ve ever heard?'),
  ('What''s a tiny thing I could do this week to make your day?'),
  ('Which of our trips or outings would you relive tomorrow?'),
  ('What''s something about me that surprised you?'),
  ('How do you most like to be comforted when you''re stressed?'),
  ('What''s a goal you want me to cheer you on for?'),
  ('What''s your ideal lazy Sunday together?'),
  ('What''s one thing we do better as a team than alone?'),
  ('What''s a compliment from me you still remember?'),
  ('If we wrote a book about us, what would the title be?'),
  ('What tradition would you like us to start?'),
  ('What''s something you''re grateful for about us today?'),
  ('What''s the funniest moment we''ve shared?'),
  ('What makes you feel most appreciated?'),
  ('Which day with me would you replay if you could?'),
  ('What''s a dream you haven''t said out loud yet?'),
  ('What do you love about how we argue and make up?'),
  ('What''s a place near home we should explore together?'),
  ('What''s one word that describes us right now, and why?');
