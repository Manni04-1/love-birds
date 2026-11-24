-- Love Birds: six more chat bubbles, pinned messages, and replying to a photo of the day.
-- Run this in the Supabase SQL Editor after roo-theme.sql. It is safe to run more than once.

-- Let profiles.bubble hold the six new looks as well as hearts and roses.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%bubble%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_bubble_check
  check (bubble in ('hearts', 'roses', 'stars', 'waves', 'letter', 'clouds', 'daisies', 'bamboo'));

-- A message can answer a photo of the day: the photo it quotes and the day it was for.
alter table public.messages add column if not exists quote_photo text check (char_length(quote_photo) <= 300);
alter table public.messages add column if not exists quote_day date;

-- Pinned messages show at the top of the chat. Either of you can pin or unpin any message.
alter table public.messages add column if not exists pinned_at timestamptz;
alter table public.messages add column if not exists pinned_by uuid references auth.users on delete set null;
create index if not exists messages_pinned_idx on public.messages (couple_id, pinned_at desc) where pinned_at is not null;

create or replace function public.pin_message(p_id uuid, p_pin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.messages
  set pinned_at = case when p_pin then now() end,
      pinned_by = case when p_pin then auth.uid() end
  where id = p_id and couple_id = public.my_couple_id()
    and (sender_id = auth.uid() or deliver_at is null or deliver_at <= now())
    and (not p_pin or unsent_at is null);
  if not found then raise exception 'That message can''t be pinned.'; end if;
end $$;

-- Unsending a message also unpins it.
create or replace function public.unsend_message(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.messages
  where id = p_id and sender_id = auth.uid() and couple_id = public.my_couple_id()
    and deliver_at is not null and deliver_at > now();
  if found then return; end if;
  update public.messages
  set unsent_at = now(), body = null, image_path = null, audio_path = null, audio_ms = null, sticker = null, hearted = false,
      quote_photo = null, pinned_at = null, pinned_by = null
  where id = p_id and sender_id = auth.uid() and couple_id = public.my_couple_id()
    and unsent_at is null and now() - coalesce(deliver_at, created_at) < interval '15 minutes';
  if not found then raise exception 'You can only unsend a message for 15 minutes after sending it.'; end if;
  update public.message_reactions set emoji = null where message_id = p_id;
end $$;

revoke execute on function public.pin_message(uuid, boolean) from public, anon;
grant execute on function public.pin_message(uuid, boolean) to authenticated;
revoke execute on function public.unsend_message(uuid) from public, anon;
grant execute on function public.unsend_message(uuid) to authenticated;

notify pgrst, 'reload schema';
