-- Love Birds notifications and bubble styles.
-- Run this once after schema.sql: Dashboard > SQL Editor > New query > paste > Run.
-- It is safe to run again.
--
-- When one of you sends a message, adds a plan or memory, answers the daily
-- question or hearts something, the database asks Expo's push service to
-- notify the other phone. Nothing here can notify anyone outside your couple.

-- ---------------------------------------------------------------------------
-- New profile fields
-- ---------------------------------------------------------------------------

-- The phone's push address, set by the app when you allow notifications.
alter table public.profiles add column if not exists push_token text
  check (char_length(push_token) <= 200);

-- Your chat bubble: 'hearts' (fuchsia with hearts) or 'roses' (thorny vines and roses).
alter table public.profiles add column if not exists bubble text
  check (bubble in ('hearts', 'roses'));

grant update (name, push_token, bubble) on public.profiles to authenticated;

-- pg_net lets the database make web requests after a change is saved.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- Sends one notification through Expo. A failure never blocks the change that caused it.
create or replace function public.push_to(p_token text, p_title text, p_body text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_token = '' then return; end if;
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_object(
        'to', p_token,
        'title', p_title,
        'body', p_body,
        'sound', 'love.wav',
        'channelId', 'love',
        'priority', 'high',
        'data', jsonb_build_object('url', p_url)
      ),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'Love Birds push failed: %', sqlerrm;
  end;
end $$;

-- Notifies the partner of p_sender. The title is the sender's name with their bubble's emoji.
create or replace function public.notify_partner(p_sender uuid, p_body text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid;
  v_name text;
  v_bubble text;
  v_token text;
begin
  select couple_id, name, bubble into v_couple, v_name, v_bubble from public.profiles where id = p_sender;
  if v_couple is null then return; end if;

  select push_token into v_token from public.profiles
  where couple_id = v_couple and id <> p_sender;

  perform public.push_to(
    v_token,
    case v_bubble when 'hearts' then '💖 ' when 'roses' then '🌹 ' else '💌 ' end || v_name,
    p_body,
    p_url
  );
end $$;

-- Lets you check notifications work on your own phone (Settings > Send me a test).
create or replace function public.send_test_notification()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_bubble text;
begin
  select push_token, bubble into v_token, v_bubble from public.profiles where id = auth.uid();
  if v_token is null then return false; end if;
  perform public.push_to(
    v_token,
    case v_bubble when 'roses' then '🌹 Love Birds' else '💖 Love Birds' end,
    'Notifications are working. This is how a love note sounds.',
    '/settings'
  );
  return true;
end $$;

revoke execute on function public.push_to(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_partner(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.send_test_notification() from public, anon;
grant execute on function public.send_test_notification() to authenticated;

-- ---------------------------------------------------------------------------
-- What sends a notification
-- ---------------------------------------------------------------------------

-- A new message.
create or replace function public.on_message_sent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner(
    new.sender_id,
    coalesce(left(new.body, 160), 'Sent you a photo 📷'),
    '/chat'
  );
  return new;
end $$;

drop trigger if exists notify_message on public.messages;
create trigger notify_message after insert on public.messages
  for each row execute function public.on_message_sent();

-- A heart on a message (tells the person who wrote it).
create or replace function public.on_message_hearted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.hearted and not old.hearted and auth.uid() is not null and auth.uid() <> new.sender_id then
    perform public.notify_partner(auth.uid(), 'Loved your message ❤️', '/chat');
  end if;
  return new;
end $$;

drop trigger if exists notify_heart on public.messages;
create trigger notify_heart after update of hearted on public.messages
  for each row execute function public.on_message_hearted();

-- A new plan.
create or replace function public.on_plan_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner(
    new.created_by,
    'Added a plan: ' || new.title || ', ' || to_char(new.day, 'Dy FMDD Mon')
      || coalesce(' at ' || to_char(new.time, 'FMHH12:MI AM'), ''),
    '/calendar?day=' || to_char(new.day, 'YYYY-MM-DD')
  );
  return new;
end $$;

drop trigger if exists notify_plan on public.events;
create trigger notify_plan after insert on public.events
  for each row execute function public.on_plan_added();

-- A new memory.
create or replace function public.on_memory_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner(new.created_by, 'Added a memory: ' || left(new.caption, 120), '/memories');
  return new;
end $$;

drop trigger if exists notify_memory on public.memories;
create trigger notify_memory after insert on public.memories
  for each row execute function public.on_memory_added();

-- A "Love" on a memory (tells the person who added it).
create or replace function public.on_memory_loved()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
begin
  select created_by into v_author from public.memories where id = new.memory_id;
  if v_author is not null and v_author <> new.user_id then
    perform public.notify_partner(new.user_id, 'Loved your memory 💞', '/memories');
  end if;
  return new;
end $$;

drop trigger if exists notify_memory_love on public.memory_loves;
create trigger notify_memory_love after insert on public.memory_loves
  for each row execute function public.on_memory_loved();

-- A daily answer. Never includes the answer itself, which stays hidden until you've both answered.
create or replace function public.on_question_answered()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_partner_answered boolean;
begin
  select exists (
    select 1 from public.answers
    where couple_id = new.couple_id and day = new.day and user_id <> new.user_id
  ) into v_partner_answered;

  perform public.notify_partner(
    new.user_id,
    case when v_partner_answered
      then 'Answered today''s question. Come and see both answers 💞'
      else 'Answered today''s question. Your turn!'
    end,
    '/question'
  );
  return new;
end $$;

drop trigger if exists notify_answer on public.answers;
create trigger notify_answer after insert on public.answers
  for each row execute function public.on_question_answered();
