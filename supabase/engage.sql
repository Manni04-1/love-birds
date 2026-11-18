-- Love Birds: a livelier Calendar, Chat and Together, plus animal icons, pet names and fonts.
-- Run this once after schema.sql, notifications.sql, together.sql and daily.sql:
-- Dashboard > SQL Editor > New query > paste > Run. It is safe to run again.
--
-- Adds: birthdays, animal icons, a font choice and a pet name for your partner;
-- message replies, reactions, editing, unsending, scheduling and voice notes;
-- open-when letters; free evenings; a weekly challenge; a bucket list; live games;
-- and the love garden, which grows with everything you do together.
-- Like everything else in Love Birds, only the two of you can see your data.

-- ---------------------------------------------------------------------------
-- Profile: birthday, animal, font and what you call your partner
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists birthday date;
alter table public.profiles add column if not exists animal text
  check (animal ~ '^[a-z-]{1,20}$');
alter table public.profiles add column if not exists font text not null default 'classic'
  check (font in ('classic', 'playful', 'handwritten'));
alter table public.profiles add column if not exists partner_nickname text
  check (char_length(partner_nickname) <= 30);

grant update (name, push_token, bubble, heat, theme, birthday, animal, font, partner_nickname)
  on public.profiles to authenticated;

-- Notifications now use the pet name the other person gave you, if they gave one.
create or replace function public.notify_partner(p_sender uuid, p_body text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid;
  v_name text;
  v_bubble text;
  v_token text;
  v_nickname text;
begin
  select couple_id, name, bubble into v_couple, v_name, v_bubble from public.profiles where id = p_sender;
  if v_couple is null then return; end if;

  select push_token, nullif(trim(partner_nickname), '') into v_token, v_nickname from public.profiles
  where couple_id = v_couple and id <> p_sender;

  perform public.push_to(
    v_token,
    case v_bubble when 'hearts' then '💖 ' when 'roses' then '🌹 ' else '💌 ' end || coalesce(v_nickname, v_name),
    p_body,
    p_url
  );
end $$;

revoke execute on function public.notify_partner(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Messages: replies, scheduling, editing, unsending and voice notes
-- ---------------------------------------------------------------------------

alter table public.messages add column if not exists reply_to uuid references public.messages on delete set null;
-- A message can wait to be delivered, for example until tomorrow morning.
alter table public.messages add column if not exists deliver_at timestamptz;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists unsent_at timestamptz;
alter table public.messages add column if not exists audio_path text check (char_length(audio_path) <= 300);
alter table public.messages add column if not exists audio_ms int check (audio_ms between 0 and 600000);

-- A message needs words, a photo or a voice note, unless it was unsent.
alter table public.messages drop constraint if exists messages_check;
alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages add constraint messages_has_content
  check (unsent_at is not null or body is not null or image_path is not null or audio_path is not null);
alter table public.messages drop constraint if exists messages_deliver_soon;
alter table public.messages add constraint messages_deliver_soon
  check (deliver_at is null or deliver_at < created_at + interval '62 days');

create index if not exists messages_due_idx on public.messages (deliver_at) where deliver_at is not null and delivered_at is null;

-- Your partner only sees a scheduled message once its time comes.
drop policy if exists "couple reads messages" on public.messages;
create policy "couple reads messages" on public.messages for select to authenticated
  using (couple_id = public.my_couple_id() and (sender_id = auth.uid() or deliver_at is null or deliver_at <= now()));
drop policy if exists "heart or mark read" on public.messages;
create policy "heart or mark read" on public.messages for update to authenticated
  using (couple_id = public.my_couple_id() and (sender_id = auth.uid() or deliver_at is null or deliver_at <= now()))
  with check (couple_id = public.my_couple_id());
revoke update on public.messages from anon, authenticated;
grant update (hearted, read_at) on public.messages to authenticated;

-- A new message, unless it's waiting for later.
create or replace function public.on_message_sent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deliver_at is not null and new.deliver_at > now() then return new; end if;
  perform public.notify_partner(
    new.sender_id,
    coalesce(left(new.body, 160), case when new.audio_path is not null then 'Sent you a voice note 🎤' else 'Sent you a photo 📷' end),
    '/chat'
  );
  return new;
end $$;

drop trigger if exists notify_message on public.messages;
create trigger notify_message after insert on public.messages
  for each row execute function public.on_message_sent();

-- Delivers scheduled messages whose time has come. Runs every minute (see the end of this file).
create or replace function public.deliver_due_messages()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, sender_id, body, audio_path from public.messages
    where deliver_at is not null and delivered_at is null and deliver_at <= now() and unsent_at is null
    order by deliver_at
    for update skip locked
  loop
    update public.messages set delivered_at = now() where id = r.id;
    perform public.notify_partner(
      r.sender_id,
      coalesce(left(r.body, 160), case when r.audio_path is not null then 'Sent you a voice note 🎤' else 'Sent you a photo 📷' end),
      '/chat'
    );
    n := n + 1;
  end loop;
  return n;
end $$;

-- Changes the words of a message you sent in the last 15 minutes (or one still waiting to be delivered).
create or replace function public.edit_message(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'Write something first.'; end if;
  if char_length(trim(p_body)) > 4000 then raise exception 'That message is too long.'; end if;
  update public.messages set body = trim(p_body), edited_at = now()
  where id = p_id and sender_id = auth.uid() and couple_id = public.my_couple_id()
    and unsent_at is null and body is not null
    and ((deliver_at is not null and deliver_at > now()) or now() - coalesce(deliver_at, created_at) < interval '15 minutes');
  if not found then raise exception 'You can only change a message for 15 minutes after sending it.'; end if;
end $$;

-- Unsends a message you sent in the last 15 minutes. A scheduled message that
-- hasn't gone yet is simply cancelled.
create or replace function public.unsend_message(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.messages
  where id = p_id and sender_id = auth.uid() and couple_id = public.my_couple_id()
    and deliver_at is not null and deliver_at > now();
  if found then return; end if;
  update public.messages
  set unsent_at = now(), body = null, image_path = null, audio_path = null, audio_ms = null, hearted = false
  where id = p_id and sender_id = auth.uid() and couple_id = public.my_couple_id()
    and unsent_at is null and now() - coalesce(deliver_at, created_at) < interval '15 minutes';
  if not found then raise exception 'You can only unsend a message for 15 minutes after sending it.'; end if;
  update public.message_reactions set emoji = null where message_id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Reactions on messages (one each per message; null means taken back)
-- ---------------------------------------------------------------------------

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages on delete cascade,
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  emoji text check (char_length(emoji) between 1 and 16),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_couple_idx on public.message_reactions (couple_id);

alter table public.message_reactions enable row level security;
drop policy if exists "couple reads reactions" on public.message_reactions;
create policy "couple reads reactions" on public.message_reactions for select to authenticated
  using (couple_id = public.my_couple_id());
revoke insert, update, delete on public.message_reactions from anon, authenticated;

-- Sets your reaction to a message, or takes it back with null.
create or replace function public.react_to_message(p_message uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
  v_sender uuid;
  v_body text;
  v_unsent timestamptz;
  v_before text;
begin
  select sender_id, body, unsent_at into v_sender, v_body, v_unsent from public.messages
  where id = p_message and couple_id = v_couple and (sender_id = auth.uid() or deliver_at is null or deliver_at <= now());
  if v_sender is null then raise exception 'That message has gone.'; end if;
  if v_unsent is not null then raise exception 'That message was unsent.'; end if;
  if p_emoji is not null and (char_length(p_emoji) not between 1 and 16) then raise exception 'Pick an emoji.'; end if;

  select emoji into v_before from public.message_reactions where message_id = p_message and user_id = auth.uid();
  insert into public.message_reactions (message_id, couple_id, user_id, emoji, updated_at)
  values (p_message, v_couple, auth.uid(), p_emoji, now())
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, updated_at = now();

  if p_emoji is not null and p_emoji is distinct from v_before and v_sender <> auth.uid() then
    perform public.notify_partner(
      auth.uid(),
      'Reacted ' || p_emoji || ' to ' || coalesce('"' || left(v_body, 60) || case when char_length(v_body) > 60 then '…"' else '"' end, 'your message'),
      '/chat'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Open-when letters: sealed until your partner chooses to open them
-- ---------------------------------------------------------------------------

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  from_user uuid not null default auth.uid() references auth.users on delete cascade,
  occasion text not null check (char_length(occasion) between 1 and 80),
  body text not null check (char_length(body) between 1 and 5000),
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists letters_couple_idx on public.letters (couple_id, created_at desc);

alter table public.letters enable row level security;
-- You read the letters you wrote. Letters to you come through get_letters().
drop policy if exists "read own letters" on public.letters;
create policy "read own letters" on public.letters for select to authenticated
  using (from_user = auth.uid() and couple_id = public.my_couple_id());
drop policy if exists "write a letter" on public.letters;
create policy "write a letter" on public.letters for insert to authenticated
  with check (from_user = auth.uid() and couple_id = public.my_couple_id());
drop policy if exists "take back an unopened letter" on public.letters;
create policy "take back an unopened letter" on public.letters for delete to authenticated
  using (from_user = auth.uid() and opened_at is null);
revoke update on public.letters from anon, authenticated;

-- All your letters. A letter to you keeps its words hidden until you open it.
create or replace function public.get_letters()
returns table (id uuid, from_user uuid, occasion text, body text, opened_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.from_user, l.occasion,
         case when l.from_user = auth.uid() or l.opened_at is not null then l.body end,
         l.opened_at, l.created_at
  from public.letters l
  where l.couple_id = public.my_couple_id()
  order by l.created_at desc;
$$;

-- Opens a letter to you and returns its words.
create or replace function public.open_letter(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_body text;
  v_occasion text;
  v_from uuid;
  v_was timestamptz;
begin
  select body, occasion, from_user, opened_at into v_body, v_occasion, v_from, v_was from public.letters
  where id = p_id and couple_id = public.my_couple_id() and from_user <> auth.uid()
  for update;
  if v_from is null then raise exception 'That letter has gone.'; end if;
  if v_was is null then
    update public.letters set opened_at = now() where id = p_id;
    perform public.notify_partner(auth.uid(), 'Opened your letter "' || v_occasion || '" 💌', '/letters');
  end if;
  return v_body;
end $$;

create or replace function public.on_letter_written()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner(new.from_user, 'Wrote you a letter: "' || new.occasion || '" 💌', '/letters');
  return new;
end $$;

drop trigger if exists notify_letter on public.letters;
create trigger notify_letter after insert on public.letters
  for each row execute function public.on_letter_written();

-- ---------------------------------------------------------------------------
-- Free evenings
-- ---------------------------------------------------------------------------

create table if not exists public.free_days (
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (couple_id, user_id, day)
);

alter table public.free_days enable row level security;
drop policy if exists "couple reads free days" on public.free_days;
create policy "couple reads free days" on public.free_days for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "mark yourself free" on public.free_days;
create policy "mark yourself free" on public.free_days for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.my_couple_id() and day >= current_date - 1);
drop policy if exists "unmark yourself" on public.free_days;
create policy "unmark yourself" on public.free_days for delete to authenticated
  using (user_id = auth.uid());
revoke update on public.free_days from anon, authenticated;

create or replace function public.on_free_day()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_both boolean;
begin
  select exists (
    select 1 from public.free_days where couple_id = new.couple_id and day = new.day and user_id <> new.user_id
  ) into v_both;
  perform public.notify_partner(
    new.user_id,
    case when v_both
      then 'Is free on ' || to_char(new.day, 'Dy FMDD Mon') || ' evening too. You''re both free 🎉'
      else 'Is free on ' || to_char(new.day, 'Dy FMDD Mon') || ' evening. Are you?'
    end,
    '/calendar?day=' || to_char(new.day, 'YYYY-MM-DD')
  );
  return new;
end $$;

drop trigger if exists notify_free_day on public.free_days;
create trigger notify_free_day after insert on public.free_days
  for each row execute function public.on_free_day();

-- ---------------------------------------------------------------------------
-- The weekly challenge (week is that week's Monday)
-- ---------------------------------------------------------------------------

create table if not exists public.challenge_done (
  couple_id uuid not null references public.couples on delete cascade,
  week date not null check (extract(isodow from week) = 1),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  challenge_key text not null check (char_length(challenge_key) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (couple_id, week, user_id)
);

alter table public.challenge_done enable row level security;
drop policy if exists "couple reads challenges" on public.challenge_done;
create policy "couple reads challenges" on public.challenge_done for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "tick off a challenge" on public.challenge_done;
create policy "tick off a challenge" on public.challenge_done for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.my_couple_id() and week >= current_date - 8);
drop policy if exists "untick a challenge" on public.challenge_done;
create policy "untick a challenge" on public.challenge_done for delete to authenticated
  using (user_id = auth.uid());
revoke update on public.challenge_done from anon, authenticated;

create or replace function public.on_challenge_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_both boolean;
begin
  select exists (
    select 1 from public.challenge_done where couple_id = new.couple_id and week = new.week and user_id <> new.user_id
  ) into v_both;
  perform public.notify_partner(
    new.user_id,
    case when v_both
      then 'Ticked off this week''s challenge too. You''ve earned a badge 🏅'
      else 'Ticked off this week''s challenge ✅ Tick it off when you have too'
    end,
    '/together'
  );
  return new;
end $$;

drop trigger if exists notify_challenge on public.challenge_done;
create trigger notify_challenge after insert on public.challenge_done
  for each row execute function public.on_challenge_done();

-- ---------------------------------------------------------------------------
-- The bucket list
-- ---------------------------------------------------------------------------

create table if not exists public.bucket_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  emoji text check (char_length(emoji) <= 16),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  done_on date,
  memory_id uuid references public.memories on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists bucket_items_couple_idx on public.bucket_items (couple_id, created_at);

alter table public.bucket_items enable row level security;
drop policy if exists "couple reads bucket list" on public.bucket_items;
create policy "couple reads bucket list" on public.bucket_items for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "couple adds to bucket list" on public.bucket_items;
create policy "couple adds to bucket list" on public.bucket_items for insert to authenticated
  with check (couple_id = public.my_couple_id() and created_by = auth.uid());
drop policy if exists "couple updates bucket list" on public.bucket_items;
create policy "couple updates bucket list" on public.bucket_items for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
drop policy if exists "couple removes from bucket list" on public.bucket_items;
create policy "couple removes from bucket list" on public.bucket_items for delete to authenticated
  using (couple_id = public.my_couple_id());
revoke update on public.bucket_items from anon, authenticated;
grant update (title, emoji, done_on, memory_id) on public.bucket_items to authenticated;

create or replace function public.on_bucket_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_partner(new.created_by, 'Added to your bucket list: ' || new.title || ' ✨', '/bucket-list');
  elsif new.done_on is not null and old.done_on is null and auth.uid() is not null then
    perform public.notify_partner(auth.uid(), 'Ticked off your bucket list: ' || new.title || ' 🎉', '/bucket-list');
  end if;
  return new;
end $$;

drop trigger if exists notify_bucket on public.bucket_items;
create trigger notify_bucket after insert or update of done_on on public.bucket_items
  for each row execute function public.on_bucket_change();

-- ---------------------------------------------------------------------------
-- Live games
-- ---------------------------------------------------------------------------

create table if not exists public.live_rounds (
  id bigint generated always as identity primary key,
  couple_id uuid not null references public.couples on delete cascade,
  question_key text not null check (char_length(question_key) between 1 and 40),
  matched boolean not null,
  played_at timestamptz not null default now()
);
create index if not exists live_rounds_couple_idx on public.live_rounds (couple_id, played_at desc);

create table if not exists public.live_invites (
  id bigint generated always as identity primary key,
  couple_id uuid not null references public.couples on delete cascade,
  from_user uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.live_rounds enable row level security;
alter table public.live_invites enable row level security;
drop policy if exists "couple reads live rounds" on public.live_rounds;
create policy "couple reads live rounds" on public.live_rounds for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "couple saves live rounds" on public.live_rounds;
create policy "couple saves live rounds" on public.live_rounds for insert to authenticated
  with check (couple_id = public.my_couple_id());
revoke update, delete on public.live_rounds from anon, authenticated;
revoke all on public.live_invites from anon, authenticated;

-- Asks your partner to come and play now. Only one invite every two minutes.
create or replace function public.invite_to_live()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
begin
  if v_couple is null then raise exception 'Link with your partner first.'; end if;
  if exists (
    select 1 from public.live_invites
    where couple_id = v_couple and from_user = auth.uid() and created_at > now() - interval '2 minutes'
  ) then return false; end if;
  insert into public.live_invites (couple_id, from_user) values (v_couple, auth.uid());
  perform public.notify_partner(auth.uid(), 'Wants to play a live game with you right now 🎮', '/live');
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- The love garden: what you've done together, and who has tended it today
-- ---------------------------------------------------------------------------

create or replace function public.get_garden(p_day date, p_since timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  with who as (select public.my_couple_id() as cid, auth.uid() as me, public.my_partner_id() as them)
  select jsonb_build_object(
    'moods', (select count(*) from public.moods, who where couple_id = who.cid),
    'nudge_days', (select count(distinct (from_user, created_at::date)) from public.nudges, who where couple_id = who.cid),
    'checkins', (select count(*) from public.checkins, who where couple_id = who.cid),
    'photos', (select count(*) from public.daily_photos, who where couple_id = who.cid),
    'answers', (select count(*) from public.answers, who where couple_id = who.cid),
    'games', (select count(*) from public.game_answers, who where couple_id = who.cid),
    'memories', (select count(*) from public.memories, who where couple_id = who.cid),
    'dates', (select count(*) from public.date_matches, who where couple_id = who.cid and done_on is not null),
    'challenges', (select count(*) from (
      select week from public.challenge_done, who where couple_id = who.cid group by week having count(distinct user_id) >= 2
    ) w),
    'bucket', (select count(*) from public.bucket_items, who where couple_id = who.cid and done_on is not null),
    'letters', (select count(*) from public.letters, who where couple_id = who.cid),
    'live', (select count(*) from public.live_rounds, who where couple_id = who.cid),
    'chat_days', (select count(*) from (
      select created_at::date from public.messages, who
      where couple_id = who.cid and unsent_at is null
      group by 1 having count(distinct sender_id) >= 2
    ) d),
    'today_me', (select
      exists (select 1 from public.moods, who where couple_id = who.cid and user_id = who.me and day = p_day)
      or exists (select 1 from public.checkins, who where couple_id = who.cid and user_id = who.me and day = p_day)
      or exists (select 1 from public.daily_photos, who where couple_id = who.cid and user_id = who.me and day = p_day)
      or exists (select 1 from public.answers, who where couple_id = who.cid and user_id = who.me and day = p_day)
      or exists (select 1 from public.nudges, who where couple_id = who.cid and from_user = who.me and created_at >= p_since)
      or exists (select 1 from public.game_answers, who where couple_id = who.cid and user_id = who.me and created_at >= p_since)
      or exists (select 1 from public.letters, who where couple_id = who.cid and from_user = who.me and created_at >= p_since)),
    'today_partner', (select
      exists (select 1 from public.moods, who where couple_id = who.cid and user_id = who.them and day = p_day)
      or exists (select 1 from public.checkins, who where couple_id = who.cid and user_id = who.them and day = p_day)
      or exists (select 1 from public.daily_photos, who where couple_id = who.cid and user_id = who.them and day = p_day)
      or exists (select 1 from public.answers, who where couple_id = who.cid and user_id = who.them and day = p_day)
      or exists (select 1 from public.nudges, who where couple_id = who.cid and from_user = who.them and created_at >= p_since)
      or exists (select 1 from public.game_answers, who where couple_id = who.cid and user_id = who.them and created_at >= p_since)
      or exists (select 1 from public.letters, who where couple_id = who.cid and from_user = who.them and created_at >= p_since))
  );
$$;

-- Together now opens on your garden, so a new date idea links straight to the ideas.
create or replace function public.add_date_idea(p_title text, p_details text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
  v_id uuid;
begin
  if v_couple is null then raise exception 'Link with your partner first.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give your idea a name.'; end if;

  insert into public.date_ideas (couple_id, title, details, category, created_by)
  values (v_couple, left(trim(p_title), 120), nullif(left(trim(p_details), 500), ''), 'ours', auth.uid())
  returning id into v_id;

  insert into public.idea_swipes (couple_id, idea_id, user_id, liked)
  values (v_couple, v_id, auth.uid(), true);

  perform public.notify_partner(auth.uid(), 'Added a date idea: ' || left(trim(p_title), 120) || '. Swipe right if you''re in 😉', '/together?tab=ideas');
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke execute on function public.deliver_due_messages() from public, anon, authenticated;
revoke execute on function public.edit_message(uuid, text) from public, anon;
revoke execute on function public.unsend_message(uuid) from public, anon;
revoke execute on function public.react_to_message(uuid, text) from public, anon;
revoke execute on function public.get_letters() from public, anon;
revoke execute on function public.open_letter(uuid) from public, anon;
revoke execute on function public.invite_to_live() from public, anon;
revoke execute on function public.get_garden(date, timestamptz) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.unsend_message(uuid) to authenticated;
grant execute on function public.react_to_message(uuid, text) to authenticated;
grant execute on function public.get_letters() to authenticated;
grant execute on function public.open_letter(uuid) to authenticated;
grant execute on function public.invite_to_live() to authenticated;
grant execute on function public.get_garden(date, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['message_reactions', 'free_days', 'challenge_done', 'bucket_items'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduled messages: check every minute for ones that are due.
-- Uses pg_cron, which every Supabase project has. If it can't be switched on,
-- scheduled messages still appear on time, just without a notification.
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'Love Birds: pg_cron is not available (%). Scheduled messages will arrive without a notification.', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('love-birds-deliver-messages', '* * * * *', 'select public.deliver_due_messages()');
  end if;
end $$;
