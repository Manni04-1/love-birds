-- Love Birds extras: a Tonight decider, shared lists, Home safe, private notifications,
-- wishlists, your story, love coupons, time capsules, stickers, a monthly recap and trip funds.
-- Run this once after schema.sql, notifications.sql, together.sql, daily.sql and engage.sql:
-- Dashboard > SQL Editor > New query > paste > Run. It is safe to run again.
-- Like everything else in Love Birds, only the two of you can see your data.

-- ---------------------------------------------------------------------------
-- Private notifications: keep what your partner wrote off your lock screen
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists private_notifications boolean not null default false;

grant update (name, push_token, bubble, heat, theme, birthday, animal, font, partner_nickname, private_notifications)
  on public.profiles to authenticated;

-- True when the partner of p_sender has asked for private notifications.
create or replace function public.partner_private(p_sender uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.private_notifications
    from public.profiles s
    join public.profiles p on p.couple_id = s.couple_id and p.id <> s.id
    where s.id = p_sender and s.couple_id is not null
    limit 1
  ), false)
$$;

-- What a notification says about a message.
create or replace function public.message_preview(p_body text, p_audio text, p_sticker text, p_private boolean)
returns text language sql immutable as $$
  select case
    when p_private then 'New message 💌'
    when p_body is not null then left(p_body, 160)
    when p_sticker is not null then 'Sent you a sticker: '
      || upper(left(replace(split_part(p_sticker, ':', 2), '-', ' '), 1))
      || substr(replace(split_part(p_sticker, ':', 2), '-', ' '), 2)
    when p_audio is not null then 'Sent you a voice note 🎤'
    else 'Sent you a photo 📷'
  end
$$;

-- ---------------------------------------------------------------------------
-- Messages: stickers
-- ---------------------------------------------------------------------------

-- An animal sticker, saved as animal:caption, for example lion:miss-you.
alter table public.messages add column if not exists sticker text
  check (sticker ~ '^[a-z-]{1,20}:[a-z-]{1,24}$');

alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages add constraint messages_has_content
  check (unsent_at is not null or body is not null or image_path is not null or audio_path is not null or sticker is not null);

create or replace function public.on_message_sent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deliver_at is not null and new.deliver_at > now() then return new; end if;
  perform public.notify_partner(
    new.sender_id,
    public.message_preview(new.body, new.audio_path, new.sticker, public.partner_private(new.sender_id)),
    '/chat'
  );
  return new;
end $$;

create or replace function public.deliver_due_messages()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, sender_id, body, audio_path, sticker from public.messages
    where deliver_at is not null and delivered_at is null and deliver_at <= now() and unsent_at is null
    order by deliver_at
    for update skip locked
  loop
    update public.messages set delivered_at = now() where id = r.id;
    perform public.notify_partner(
      r.sender_id,
      public.message_preview(r.body, r.audio_path, r.sticker, public.partner_private(r.sender_id)),
      '/chat'
    );
    n := n + 1;
  end loop;
  return n;
end $$;

-- Unsending now clears a sticker too.
create or replace function public.unsend_message(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.messages
  where id = p_id and sender_id = auth.uid() and couple_id = public.my_couple_id()
    and deliver_at is not null and deliver_at > now();
  if found then return; end if;
  update public.messages
  set unsent_at = now(), body = null, image_path = null, audio_path = null, audio_ms = null, sticker = null, hearted = false
  where id = p_id and sender_id = auth.uid() and couple_id = public.my_couple_id()
    and unsent_at is null and now() - coalesce(deliver_at, created_at) < interval '15 minutes';
  if not found then raise exception 'You can only unsend a message for 15 minutes after sending it.'; end if;
  update public.message_reactions set emoji = null where message_id = p_id;
end $$;

-- Reactions quote the message, unless your partner keeps their notifications private.
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
      'Reacted ' || p_emoji || ' to ' || case
        when public.partner_private(auth.uid()) then 'your message'
        else coalesce('"' || left(v_body, 60) || case when char_length(v_body) > 60 then '…"' else '"' end, 'your message')
      end,
      '/chat'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tonight: you both swipe through options, and the first one you both like wins
-- ---------------------------------------------------------------------------

create table if not exists public.deciders (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  kind text not null check (kind in ('eat', 'watch', 'do')),
  -- [{ key, emoji, label }]
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 40),
  created_by uuid not null references auth.users on delete cascade,
  -- Who has swiped through every option.
  done_by uuid[] not null default '{}',
  winner text check (char_length(winner) <= 40),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists deciders_couple_idx on public.deciders (couple_id, created_at desc);

-- Your swipes. Your partner never sees them, only the winner.
create table if not exists public.decider_votes (
  decider_id uuid not null references public.deciders on delete cascade,
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  option_key text not null check (char_length(option_key) between 1 and 40),
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (decider_id, user_id, option_key)
);

alter table public.deciders enable row level security;
alter table public.decider_votes enable row level security;
drop policy if exists "couple reads deciders" on public.deciders;
create policy "couple reads deciders" on public.deciders for select to authenticated
  using (couple_id = public.my_couple_id());
revoke insert, update, delete on public.deciders from anon, authenticated;
drop policy if exists "read own decider votes" on public.decider_votes;
create policy "read own decider votes" on public.decider_votes for select to authenticated
  using (user_id = auth.uid() and couple_id = public.my_couple_id());
revoke insert, update, delete on public.decider_votes from anon, authenticated;

-- Starts deciding something for tonight. Returns its id.
create or replace function public.start_decider(p_kind text, p_options jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
  v_options jsonb;
  v_id uuid;
begin
  if v_couple is null then raise exception 'Link with your partner first.'; end if;
  if p_kind is null or p_kind not in ('eat', 'watch', 'do') then raise exception 'Pick what you''re deciding.'; end if;
  if jsonb_typeof(p_options) is distinct from 'array' then raise exception 'Add some options first.'; end if;

  select jsonb_agg(jsonb_build_object('key', k, 'emoji', e, 'label', l) order by ord) into v_options
  from (
    select distinct on (o->>'key') o->>'key' as k, left(coalesce(o->>'emoji', ''), 16) as e, left(trim(o->>'label'), 60) as l, ord
    from jsonb_array_elements(p_options) with ordinality as t(o, ord)
    where jsonb_typeof(o) = 'object' and (o->>'key') ~ '^[a-z0-9-]{1,40}$' and coalesce(trim(o->>'label'), '') <> ''
    order by o->>'key', ord
  ) x;
  if coalesce(jsonb_array_length(v_options), 0) < 2 then raise exception 'Pick at least two options.'; end if;
  if jsonb_array_length(v_options) > 40 then raise exception 'That''s a lot of options. Pick up to 40.'; end if;

  insert into public.deciders (couple_id, kind, options, created_by)
  values (v_couple, p_kind, v_options, auth.uid())
  returning id into v_id;

  perform public.notify_partner(
    auth.uid(),
    case p_kind
      when 'eat' then 'What should we eat tonight? Swipe with me 🍽️'
      when 'watch' then 'What should we watch tonight? Swipe with me 🍿'
      else 'What should we do tonight? Swipe with me ✨'
    end,
    '/tonight'
  );
  return v_id;
end $$;

-- Swipes one option. Returns the winner once you've both liked the same one.
create or replace function public.vote_decider(p_decider uuid, p_option text, p_liked boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
  v_partner uuid := public.my_partner_id();
  v_options jsonb;
  v_winner text;
  v_done uuid[];
  v_label text;
begin
  select options, winner, done_by into v_options, v_winner, v_done from public.deciders
  where id = p_decider and couple_id = v_couple
  for update;
  if v_options is null then raise exception 'That one has gone. Start a new one.'; end if;
  if v_winner is not null then return v_winner; end if;
  if not exists (select 1 from jsonb_array_elements(v_options) o where o->>'key' = p_option) then
    raise exception 'That option isn''t there any more.';
  end if;

  insert into public.decider_votes (decider_id, couple_id, user_id, option_key, liked)
  values (p_decider, v_couple, auth.uid(), p_option, coalesce(p_liked, false))
  on conflict (decider_id, user_id, option_key) do update set liked = excluded.liked, created_at = now();

  if coalesce(p_liked, false) and v_partner is not null and exists (
    select 1 from public.decider_votes
    where decider_id = p_decider and user_id = v_partner and option_key = p_option and liked
  ) then
    update public.deciders set winner = p_option, decided_at = now() where id = p_decider;
    select trim(coalesce(o->>'emoji', '') || ' ' || (o->>'label')) into v_label
    from jsonb_array_elements(v_options) o where o->>'key' = p_option limit 1;
    perform public.notify_partner(auth.uid(), 'It''s a match: ' || v_label || '! That''s tonight sorted 🎉', '/tonight');
    return p_option;
  end if;

  -- Note when you've swiped through everything, so your partner knows you're waiting.
  if not (auth.uid() = any (v_done)) and (
    select count(*) from public.decider_votes where decider_id = p_decider and user_id = auth.uid()
  ) >= jsonb_array_length(v_options) then
    update public.deciders set done_by = array_append(done_by, auth.uid()) where id = p_decider;
  end if;
  return null;
end $$;

-- The latest decision from the last day, with your own swipes.
create or replace function public.get_tonight()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', d.id,
    'kind', d.kind,
    'options', d.options,
    'created_by', d.created_by,
    'done_by', to_jsonb(d.done_by),
    'winner', d.winner,
    'decided_at', d.decided_at,
    'created_at', d.created_at,
    'mine', coalesce((
      select jsonb_object_agg(v.option_key, v.liked) from public.decider_votes v
      where v.decider_id = d.id and v.user_id = auth.uid()
    ), '{}'::jsonb)
  )
  from public.deciders d
  where d.couple_id = public.my_couple_id() and d.created_at > now() - interval '20 hours'
  order by d.created_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Shared lists: shopping, to-dos and things to watch
-- ---------------------------------------------------------------------------

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  list text not null check (list in ('groceries', 'todo', 'watch')),
  text text not null check (char_length(text) between 1 and 200),
  done_at timestamptz,
  done_by uuid references auth.users on delete set null,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists list_items_couple_idx on public.list_items (couple_id, list, created_at);

alter table public.list_items enable row level security;
drop policy if exists "couple reads lists" on public.list_items;
create policy "couple reads lists" on public.list_items for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "couple adds to lists" on public.list_items;
create policy "couple adds to lists" on public.list_items for insert to authenticated
  with check (couple_id = public.my_couple_id() and created_by = auth.uid());
drop policy if exists "couple ticks lists" on public.list_items;
create policy "couple ticks lists" on public.list_items for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
drop policy if exists "couple clears lists" on public.list_items;
create policy "couple clears lists" on public.list_items for delete to authenticated
  using (couple_id = public.my_couple_id());
revoke update on public.list_items from anon, authenticated;
grant update (text, done_at, done_by) on public.list_items to authenticated;

-- Tells your partner what you added, at most once every 15 minutes per list.
create or replace function public.on_list_item_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.list_items
    where couple_id = new.couple_id and list = new.list and created_by = new.created_by
      and id <> new.id and created_at > now() - interval '15 minutes'
  ) then
    return new;
  end if;
  perform public.notify_partner(
    new.created_by,
    case new.list
      when 'groceries' then 'Added to the shopping list: ' || left(new.text, 80) || ' 🛒'
      when 'todo' then 'Added a to-do: ' || left(new.text, 80) || ' ✅'
      else 'Added to your watchlist: ' || left(new.text, 80) || ' 🍿'
    end,
    '/lists?list=' || new.list
  );
  return new;
end $$;

drop trigger if exists notify_list_item on public.list_items;
create trigger notify_list_item after insert on public.list_items
  for each row execute function public.on_list_item_added();

-- ---------------------------------------------------------------------------
-- Home safe: "let me know when you're home", and one tap to say you are
-- ---------------------------------------------------------------------------

create table if not exists public.home_safe (
  id bigint generated always as identity primary key,
  couple_id uuid not null references public.couples on delete cascade,
  from_user uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('ask', 'safe')),
  created_at timestamptz not null default now()
);
create index if not exists home_safe_couple_idx on public.home_safe (couple_id, created_at desc);

alter table public.home_safe enable row level security;
drop policy if exists "couple reads home safe" on public.home_safe;
create policy "couple reads home safe" on public.home_safe for select to authenticated
  using (couple_id = public.my_couple_id());
revoke insert, update, delete on public.home_safe from anon, authenticated;

-- 'ask': asks your partner to let you know when they're home. 'safe': tells them you are.
create or replace function public.send_home_safe(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
  v_recent boolean;
begin
  if v_couple is null then raise exception 'Link with your partner first.'; end if;
  if p_kind is null or p_kind not in ('ask', 'safe') then raise exception 'Something went wrong. Try again.'; end if;
  select exists (
    select 1 from public.home_safe
    where couple_id = v_couple and from_user = auth.uid() and kind = p_kind and created_at > now() - interval '1 minute'
  ) into v_recent;
  insert into public.home_safe (couple_id, from_user, kind) values (v_couple, auth.uid(), p_kind);
  if not v_recent then
    perform public.notify_partner(
      auth.uid(),
      case p_kind when 'ask' then 'Let me know when you''re home safe 🏠 Tap to tell me' else 'Home safe 🏠💕' end,
      '/'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Wishlists, with a secret "I'll get this" your partner never sees
-- ---------------------------------------------------------------------------

create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  emoji text check (char_length(emoji) <= 16),
  note text check (char_length(note) <= 300),
  link text check (char_length(link) <= 500),
  -- Set by the one who wished for it, once they have it.
  received_on date,
  created_at timestamptz not null default now()
);
create index if not exists wishes_couple_idx on public.wishes (couple_id, created_at desc);

-- Only the one getting the gift can see this.
create table if not exists public.wish_claims (
  wish_id uuid primary key references public.wishes on delete cascade,
  couple_id uuid not null references public.couples on delete cascade,
  claimed_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.wishes enable row level security;
alter table public.wish_claims enable row level security;

drop policy if exists "couple reads wishes" on public.wishes;
create policy "couple reads wishes" on public.wishes for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "add own wish" on public.wishes;
create policy "add own wish" on public.wishes for insert to authenticated
  with check (couple_id = public.my_couple_id() and user_id = auth.uid());
drop policy if exists "change own wish" on public.wishes;
create policy "change own wish" on public.wishes for update to authenticated
  using (user_id = auth.uid() and couple_id = public.my_couple_id())
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());
drop policy if exists "remove own wish" on public.wishes;
create policy "remove own wish" on public.wishes for delete to authenticated
  using (user_id = auth.uid());
revoke update on public.wishes from anon, authenticated;
grant update (title, emoji, note, link, received_on) on public.wishes to authenticated;

drop policy if exists "read own claims" on public.wish_claims;
create policy "read own claims" on public.wish_claims for select to authenticated
  using (claimed_by = auth.uid());
drop policy if exists "claim a partner's wish" on public.wish_claims;
create policy "claim a partner's wish" on public.wish_claims for insert to authenticated
  with check (
    claimed_by = auth.uid() and couple_id = public.my_couple_id()
    and exists (select 1 from public.wishes w where w.id = wish_id and w.couple_id = public.my_couple_id() and w.user_id <> auth.uid())
  );
drop policy if exists "unclaim" on public.wish_claims;
create policy "unclaim" on public.wish_claims for delete to authenticated
  using (claimed_by = auth.uid());
revoke update on public.wish_claims from anon, authenticated;

create or replace function public.on_wish_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.wishes
    where couple_id = new.couple_id and user_id = new.user_id and id <> new.id and created_at > now() - interval '10 minutes'
  ) then
    return new;
  end if;
  perform public.notify_partner(new.user_id, 'Added to their wishlist: ' || left(new.title, 80) || ' 🎁', '/wishlist?who=partner');
  return new;
end $$;

drop trigger if exists notify_wish on public.wishes;
create trigger notify_wish after insert on public.wishes
  for each row execute function public.on_wish_added();

-- ---------------------------------------------------------------------------
-- Our story: the firsts and big moments, remembered every year
-- ---------------------------------------------------------------------------

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  emoji text check (char_length(emoji) <= 16),
  happened_on date not null,
  note text check (char_length(note) <= 500),
  -- Show it on the calendar every year.
  yearly boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists milestones_couple_idx on public.milestones (couple_id, happened_on);

alter table public.milestones enable row level security;
drop policy if exists "couple reads story" on public.milestones;
create policy "couple reads story" on public.milestones for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "couple adds to story" on public.milestones;
create policy "couple adds to story" on public.milestones for insert to authenticated
  with check (couple_id = public.my_couple_id() and created_by = auth.uid());
drop policy if exists "couple edits story" on public.milestones;
create policy "couple edits story" on public.milestones for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
drop policy if exists "couple removes from story" on public.milestones;
create policy "couple removes from story" on public.milestones for delete to authenticated
  using (couple_id = public.my_couple_id());
revoke update on public.milestones from anon, authenticated;
grant update (title, emoji, happened_on, note, yearly) on public.milestones to authenticated;

create or replace function public.on_milestone_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner(
    new.created_by,
    'Added to your story: ' || coalesce(nullif(new.emoji, '') || ' ', '') || left(new.title, 80) || ', ' || to_char(new.happened_on, 'FMDD Mon YYYY'),
    '/our-story'
  );
  return new;
end $$;

drop trigger if exists notify_milestone on public.milestones;
create trigger notify_milestone after insert on public.milestones
  for each row execute function public.on_milestone_added();

-- ---------------------------------------------------------------------------
-- Love coupons: give one, your partner redeems it, you make it happen
-- ---------------------------------------------------------------------------

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  from_user uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  emoji text check (char_length(emoji) <= 16),
  note text check (char_length(note) <= 300),
  redeemed_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists coupons_couple_idx on public.coupons (couple_id, created_at desc);

alter table public.coupons enable row level security;
drop policy if exists "couple reads coupons" on public.coupons;
create policy "couple reads coupons" on public.coupons for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "give a coupon" on public.coupons;
create policy "give a coupon" on public.coupons for insert to authenticated
  with check (couple_id = public.my_couple_id() and from_user = auth.uid() and redeemed_at is null and done_at is null);
drop policy if exists "take back an unused coupon" on public.coupons;
create policy "take back an unused coupon" on public.coupons for delete to authenticated
  using (from_user = auth.uid() and redeemed_at is null);
revoke update on public.coupons from anon, authenticated;

create or replace function public.on_coupon_given()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.coupons
    where couple_id = new.couple_id and from_user = new.from_user and id <> new.id and created_at > now() - interval '10 minutes'
  ) then
    return new;
  end if;
  perform public.notify_partner(new.from_user, 'Gave you a love coupon: ' || coalesce(nullif(new.emoji, '') || ' ', '') || new.title || ' 🎟️', '/coupons');
  return new;
end $$;

drop trigger if exists notify_coupon on public.coupons;
create trigger notify_coupon after insert on public.coupons
  for each row execute function public.on_coupon_given();

-- Cashes in a coupon your partner gave you.
create or replace function public.redeem_coupon(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  update public.coupons set redeemed_at = now()
  where id = p_id and couple_id = public.my_couple_id() and from_user <> auth.uid() and redeemed_at is null
  returning title into v_title;
  if v_title is null then raise exception 'That coupon has already been used.'; end if;
  perform public.notify_partner(auth.uid(), 'Redeemed your love coupon: ' || v_title || ' 🎟️ Time to make it happen!', '/coupons');
end $$;

-- Marks a coupon you gave as done, once you've made it happen.
create or replace function public.complete_coupon(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  update public.coupons set done_at = now()
  where id = p_id and couple_id = public.my_couple_id() and from_user = auth.uid() and redeemed_at is not null and done_at is null
  returning title into v_title;
  if v_title is null then raise exception 'That coupon isn''t waiting for you.'; end if;
  perform public.notify_partner(auth.uid(), 'Made your coupon happen: ' || v_title || ' 💝', '/coupons');
end $$;

-- ---------------------------------------------------------------------------
-- Time capsules: a letter (and a photo) that stays locked until a date
-- ---------------------------------------------------------------------------

alter table public.letters add column if not exists unlock_at timestamptz;
alter table public.letters add column if not exists photo_path text check (char_length(photo_path) <= 300);
alter table public.letters add column if not exists unlock_notified_at timestamptz;
alter table public.letters drop constraint if exists letters_unlock_range;
alter table public.letters add constraint letters_unlock_range
  check (unlock_at is null or unlock_at < created_at + interval '30 years');
create index if not exists letters_unlock_idx on public.letters (unlock_at) where unlock_at is not null and unlock_notified_at is null;

-- All your letters. A letter to you keeps its words and photo hidden until you open it.
drop function if exists public.get_letters();
create function public.get_letters()
returns table (id uuid, from_user uuid, occasion text, body text, opened_at timestamptz, created_at timestamptz, unlock_at timestamptz, photo_path text)
language sql stable security definer set search_path = public as $$
  select l.id, l.from_user, l.occasion,
         case when l.from_user = auth.uid() or l.opened_at is not null then l.body end,
         l.opened_at, l.created_at, l.unlock_at,
         case when l.from_user = auth.uid() or l.opened_at is not null then l.photo_path end
  from public.letters l
  where l.couple_id = public.my_couple_id()
  order by l.created_at desc;
$$;

-- Opens a letter to you and returns its words. A time capsule opens on its day.
create or replace function public.open_letter(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_body text;
  v_occasion text;
  v_from uuid;
  v_was timestamptz;
  v_unlock timestamptz;
begin
  select body, occasion, from_user, opened_at, unlock_at into v_body, v_occasion, v_from, v_was, v_unlock from public.letters
  where id = p_id and couple_id = public.my_couple_id() and from_user <> auth.uid()
  for update;
  if v_from is null then raise exception 'That letter has gone.'; end if;
  if v_unlock is not null and v_unlock > now() then raise exception 'This time capsule is still locked. It opens on its day ⏳'; end if;
  if v_was is null then
    update public.letters set opened_at = now() where id = p_id;
    perform public.notify_partner(
      auth.uid(),
      case
        when v_unlock is not null then 'Opened your time capsule ⏳💌'
        when public.partner_private(auth.uid()) then 'Opened your letter 💌'
        else 'Opened your letter "' || v_occasion || '" 💌'
      end,
      '/letters'
    );
  end if;
  return v_body;
end $$;

create or replace function public.on_letter_written()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_days int;
begin
  if new.unlock_at is not null and new.unlock_at > now() then
    v_days := greatest(1, ceil(extract(epoch from new.unlock_at - now()) / 86400)::int);
    perform public.notify_partner(
      new.from_user,
      'Sealed a time capsule for you ⏳ It opens in ' || v_days || case when v_days = 1 then ' day' else ' days' end,
      '/letters'
    );
  else
    perform public.notify_partner(
      new.from_user,
      case when public.partner_private(new.from_user) then 'Wrote you a letter 💌' else 'Wrote you a letter: "' || new.occasion || '" 💌' end,
      '/letters'
    );
  end if;
  return new;
end $$;

-- Tells the one it's for when a time capsule unlocks. Runs every 15 minutes (see the end of this file).
create or replace function public.release_capsules()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, from_user from public.letters
    where unlock_at is not null and unlock_at <= now() and unlock_notified_at is null and opened_at is null
    for update skip locked
  loop
    update public.letters set unlock_notified_at = now() where id = r.id;
    perform public.notify_partner(r.from_user, 'Your time capsule just unlocked. Open it ⏳💌', '/letters');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Trip funds: save up together for a dream
-- ---------------------------------------------------------------------------

create table if not exists public.funds (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  emoji text check (char_length(emoji) <= 16),
  -- Kenyan shillings.
  target int not null check (target between 1 and 100000000),
  bucket_item uuid references public.bucket_items on delete set null,
  reached_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists funds_couple_idx on public.funds (couple_id, created_at);

create table if not exists public.fund_entries (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds on delete cascade,
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  amount int not null check (amount between 1 and 100000000),
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists fund_entries_fund_idx on public.fund_entries (fund_id, created_at desc);

alter table public.funds enable row level security;
alter table public.fund_entries enable row level security;
drop policy if exists "couple reads funds" on public.funds;
create policy "couple reads funds" on public.funds for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "couple starts funds" on public.funds;
create policy "couple starts funds" on public.funds for insert to authenticated
  with check (couple_id = public.my_couple_id() and created_by = auth.uid() and reached_at is null);
drop policy if exists "couple changes funds" on public.funds;
create policy "couple changes funds" on public.funds for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
drop policy if exists "couple removes funds" on public.funds;
create policy "couple removes funds" on public.funds for delete to authenticated
  using (couple_id = public.my_couple_id());
revoke update on public.funds from anon, authenticated;
grant update (title, emoji, target, bucket_item) on public.funds to authenticated;

drop policy if exists "couple reads savings" on public.fund_entries;
create policy "couple reads savings" on public.fund_entries for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "add your savings" on public.fund_entries;
create policy "add your savings" on public.fund_entries for insert to authenticated
  with check (
    user_id = auth.uid() and couple_id = public.my_couple_id()
    and exists (select 1 from public.funds f where f.id = fund_id and f.couple_id = public.my_couple_id())
  );
drop policy if exists "remove your savings" on public.fund_entries;
create policy "remove your savings" on public.fund_entries for delete to authenticated
  using (user_id = auth.uid());
revoke update on public.fund_entries from anon, authenticated;

-- A bigger target means there's more to save, so the celebration can come again.
create or replace function public.on_fund_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.target > old.target then new.reached_at := null; end if;
  return new;
end $$;

drop trigger if exists fund_target_changed on public.funds;
create trigger fund_target_changed before update of target on public.funds
  for each row execute function public.on_fund_changed();

create or replace function public.on_fund_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_emoji text;
  v_target int;
  v_reached timestamptz;
  v_total bigint;
begin
  select title, coalesce(nullif(emoji, ''), '✈️'), target, reached_at into v_title, v_emoji, v_target, v_reached
  from public.funds where id = new.fund_id
  for update;
  if v_title is null then return new; end if;
  select coalesce(sum(amount), 0) into v_total from public.fund_entries where fund_id = new.fund_id;
  if v_reached is null and v_total >= v_target then
    update public.funds set reached_at = now() where id = new.fund_id;
    perform public.notify_partner(new.user_id, 'You did it! ' || v_title || ' is fully saved up 🎉', '/trip-fund');
  else
    perform public.notify_partner(
      new.user_id,
      'Saved KSh ' || to_char(new.amount, 'FM999,999,999') || ' for ' || v_title || ' ' || v_emoji
        || ' · ' || least(100, floor(v_total * 100.0 / v_target))::int || '% there',
      '/trip-fund'
    );
  end if;
  return new;
end $$;

drop trigger if exists notify_fund_entry on public.fund_entries;
create trigger notify_fund_entry after insert on public.fund_entries
  for each row execute function public.on_fund_entry();

-- ---------------------------------------------------------------------------
-- The monthly recap
-- ---------------------------------------------------------------------------

-- What the two of you did between two dates (p_from to p_to, and the same span as times).
create or replace function public.get_recap(p_from date, p_to date, p_since timestamptz, p_until timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  with who as (select public.my_couple_id() as cid, auth.uid() as me, public.my_partner_id() as them),
  msgs as (
    select m.sender_id, m.created_at, m.hearted, m.image_path, m.sticker
    from public.messages m, who
    where m.couple_id = who.cid and m.unsent_at is null
      and coalesce(m.deliver_at, m.created_at) >= p_since and coalesce(m.deliver_at, m.created_at) < p_until
      and (m.deliver_at is null or m.deliver_at <= now())
  ),
  busiest as (
    select (created_at at time zone 'Africa/Nairobi')::date as day, count(*) as n
    from msgs group by 1 order by 2 desc, 1 limit 1
  )
  select jsonb_build_object(
    'messages_me', (select count(*) from msgs, who where sender_id = who.me),
    'messages_partner', (select count(*) from msgs, who where sender_id = who.them),
    'hearts', (select count(*) from msgs where hearted),
    'chat_photos', (select count(*) from msgs where image_path is not null),
    'stickers', (select count(*) from msgs where sticker is not null),
    'busiest_day', (select day from busiest),
    'busiest_count', (select n from busiest),
    'chat_days', (select count(*) from (
      select (created_at at time zone 'Africa/Nairobi')::date from msgs group by 1 having count(distinct sender_id) >= 2
    ) d),
    'nudges_me', (select count(*) from public.nudges, who where couple_id = who.cid and from_user = who.me and created_at >= p_since and created_at < p_until),
    'nudges_partner', (select count(*) from public.nudges, who where couple_id = who.cid and from_user = who.them and created_at >= p_since and created_at < p_until),
    'moods_me', (select coalesce(jsonb_agg(jsonb_build_object('emoji', emoji, 'n', n) order by n desc, emoji), '[]'::jsonb) from (
      select emoji, count(*) as n from public.moods, who
      where couple_id = who.cid and user_id = who.me and day between p_from and p_to
      group by emoji order by n desc, emoji limit 3
    ) x),
    'moods_partner', (select coalesce(jsonb_agg(jsonb_build_object('emoji', emoji, 'n', n) order by n desc, emoji), '[]'::jsonb) from (
      select emoji, count(*) as n from public.moods, who
      where couple_id = who.cid and user_id = who.them and day between p_from and p_to
      group by emoji order by n desc, emoji limit 3
    ) x),
    'answers_both', (select count(*) from (
      select day from public.answers, who where couple_id = who.cid and day between p_from and p_to group by day having count(*) >= 2
    ) d),
    'checkins_both', (select count(*) from (
      select day from public.checkins, who where couple_id = who.cid and day between p_from and p_to group by day having count(*) >= 2
    ) d),
    'daily_photos', (select count(*) from public.daily_photos, who where couple_id = who.cid and day between p_from and p_to),
    'memories', (select count(*) from public.memories, who where couple_id = who.cid and happened_on between p_from and p_to),
    'memory_photo', (select photo_path from public.memories, who
      where couple_id = who.cid and happened_on between p_from and p_to and photo_path is not null
      order by (select count(*) from public.memory_loves l where l.memory_id = memories.id) desc, happened_on desc limit 1),
    'memory_caption', (select caption from public.memories, who
      where couple_id = who.cid and happened_on between p_from and p_to and photo_path is not null
      order by (select count(*) from public.memory_loves l where l.memory_id = memories.id) desc, happened_on desc limit 1),
    'dates', (select count(*) from public.date_matches, who where couple_id = who.cid and done_on between p_from and p_to),
    'bucket', (select count(*) from public.bucket_items, who where couple_id = who.cid and done_on between p_from and p_to),
    'challenges', (select count(*) from (
      select week from public.challenge_done, who where couple_id = who.cid and week between p_from - 6 and p_to
      group by week having count(distinct user_id) >= 2
    ) w),
    'letters', (select count(*) from public.letters, who where couple_id = who.cid and created_at >= p_since and created_at < p_until),
    'live', (select count(*) from public.live_rounds, who where couple_id = who.cid and played_at >= p_since and played_at < p_until),
    'games', (select count(*) from public.game_answers, who where couple_id = who.cid and created_at >= p_since and created_at < p_until),
    'tonight', (select count(*) from public.deciders, who where couple_id = who.cid and winner is not null and decided_at >= p_since and decided_at < p_until),
    'coupons', (select count(*) from public.coupons, who where couple_id = who.cid and done_at >= p_since and done_at < p_until),
    'story', (select count(*) from public.milestones, who where couple_id = who.cid and created_at >= p_since and created_at < p_until),
    'saved', (select coalesce(sum(amount), 0) from public.fund_entries, who where couple_id = who.cid and created_at >= p_since and created_at < p_until),
    'home_safe', (select count(*) from public.home_safe, who where couple_id = who.cid and kind = 'safe' and created_at >= p_since and created_at < p_until)
  )
$$;

-- On the 1st of each month: "Your October together". Runs at 9 AM in Nairobi (see the end of this file).
create or replace function public.send_monthly_recaps()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  v_month text := to_char(now() - interval '2 days', 'FMMonth');
begin
  for r in
    select p.push_token from public.profiles p
    where p.couple_id is not null and p.push_token is not null
      and (select count(*) from public.profiles q where q.couple_id = p.couple_id) = 2
      and exists (select 1 from public.messages m where m.couple_id = p.couple_id and m.created_at > now() - interval '40 days')
  loop
    perform public.push_to(r.push_token, '📊 Your ' || v_month || ' together', 'Your monthly recap is ready. See what you two got up to 💞', '/recap');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- The love garden grows with the new things too
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
    'tonight', (select count(*) from public.deciders, who where couple_id = who.cid and winner is not null),
    'coupons', (select count(*) from public.coupons, who where couple_id = who.cid and done_at is not null),
    'story', (select count(*) from public.milestones, who where couple_id = who.cid),
    'wishes', (select count(*) from public.wishes, who where couple_id = who.cid and received_on is not null),
    'saved', (select count(*) from public.fund_entries, who where couple_id = who.cid),
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

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke execute on function public.partner_private(uuid) from public, anon, authenticated;
revoke execute on function public.release_capsules() from public, anon, authenticated;
revoke execute on function public.send_monthly_recaps() from public, anon, authenticated;
revoke execute on function public.deliver_due_messages() from public, anon, authenticated;
revoke execute on function public.unsend_message(uuid) from public, anon;
revoke execute on function public.react_to_message(uuid, text) from public, anon;
revoke execute on function public.start_decider(text, jsonb) from public, anon;
revoke execute on function public.vote_decider(uuid, text, boolean) from public, anon;
revoke execute on function public.get_tonight() from public, anon;
revoke execute on function public.send_home_safe(text) from public, anon;
revoke execute on function public.redeem_coupon(uuid) from public, anon;
revoke execute on function public.complete_coupon(uuid) from public, anon;
revoke execute on function public.get_letters() from public, anon;
revoke execute on function public.open_letter(uuid) from public, anon;
revoke execute on function public.get_recap(date, date, timestamptz, timestamptz) from public, anon;
revoke execute on function public.get_garden(date, timestamptz) from public, anon;
grant execute on function public.unsend_message(uuid) to authenticated;
grant execute on function public.react_to_message(uuid, text) to authenticated;
grant execute on function public.start_decider(text, jsonb) to authenticated;
grant execute on function public.vote_decider(uuid, text, boolean) to authenticated;
grant execute on function public.get_tonight() to authenticated;
grant execute on function public.send_home_safe(text) to authenticated;
grant execute on function public.redeem_coupon(uuid) to authenticated;
grant execute on function public.complete_coupon(uuid) to authenticated;
grant execute on function public.get_letters() to authenticated;
grant execute on function public.open_letter(uuid) to authenticated;
grant execute on function public.get_recap(date, date, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_garden(date, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['deciders', 'list_items', 'home_safe', 'wishes', 'milestones', 'coupons', 'funds', 'fund_entries'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs: time capsules every 15 minutes, the recap on the 1st at
-- 9 AM in Nairobi (6 AM UTC). They need pg_cron, which engage.sql switched on.
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'Love Birds: pg_cron is not available (%). Time capsules still open on their day, just without a notification.', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('love-birds-time-capsules', '*/15 * * * *', 'select public.release_capsules()');
    perform cron.schedule('love-birds-monthly-recap', '0 6 1 * *', 'select public.send_monthly_recaps()');
  end if;
end $$;
