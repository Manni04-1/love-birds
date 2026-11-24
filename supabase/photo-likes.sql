-- Love Birds: like your partner's photo of the day.
-- Run this in the Supabase SQL Editor after chimes.sql. It is safe to run more than once.

-- liked_at: when your partner liked this photo. Null means not liked.
alter table public.daily_photos add column if not exists liked_at timestamptz;

-- Swapping a photo for a new one clears the like on the old one.
create or replace function public.on_daily_photo_swap()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.photo_path is distinct from old.photo_path then new.liked_at := null; end if;
  return new;
end $$;

drop trigger if exists daily_photo_swap on public.daily_photos;
create trigger daily_photo_swap before update on public.daily_photos
  for each row execute function public.on_daily_photo_swap();

-- Likes or unlikes your partner's photo for a day. You can only like a photo you can see,
-- so you need to have added your own that day too. The first like sends a notification.
create or replace function public.like_daily_photo(p_day date, p_like boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
  v_partner uuid := public.my_partner_id();
  v_was timestamptz;
begin
  if v_couple is null or v_partner is null then raise exception 'Link with your partner first.'; end if;
  if not exists (select 1 from public.daily_photos where couple_id = v_couple and day = p_day and user_id = auth.uid()) then
    raise exception 'Add your own photo for that day first.';
  end if;
  select liked_at into v_was from public.daily_photos where couple_id = v_couple and day = p_day and user_id = v_partner;
  if not found then raise exception 'That photo isn''t there any more.'; end if;
  update public.daily_photos
    set liked_at = case when p_like then coalesce(liked_at, now()) end
    where couple_id = v_couple and day = p_day and user_id = v_partner;
  if p_like and v_was is null then
    perform public.notify_partner(auth.uid(), 'Loved your photo of the day ❤️', '/photo-of-the-day');
  end if;
end $$;

revoke execute on function public.like_daily_photo(date, boolean) from public, anon;
grant execute on function public.like_daily_photo(date, boolean) to authenticated;

-- get_daily_photos now also says whether each photo is liked. Its columns change, so it is made again.
drop function if exists public.get_daily_photos(date, date);
create function public.get_daily_photos(p_from date, p_to date)
returns table (day date, user_id uuid, photo_path text, caption text, created_at timestamptz, liked_at timestamptz)
language sql stable security definer set search_path = public as $$
  with who as (select auth.uid() as me, public.my_partner_id() as them, public.my_couple_id() as cid)
  select p.day, p.user_id,
         case when p.user_id = who.me or exists (
           select 1 from public.daily_photos m where m.couple_id = who.cid and m.day = p.day and m.user_id = who.me
         ) then p.photo_path end,
         case when p.user_id = who.me or exists (
           select 1 from public.daily_photos m where m.couple_id = who.cid and m.day = p.day and m.user_id = who.me
         ) then p.caption end,
         p.created_at,
         p.liked_at
  from public.daily_photos p, who
  where p.couple_id = who.cid and p.user_id in (who.me, who.them) and p.day between p_from and p_to
  order by p.day desc, p.created_at;
$$;

revoke execute on function public.get_daily_photos(date, date) from public, anon;
grant execute on function public.get_daily_photos(date, date) to authenticated;

-- So the app can use the new function straight away.
notify pgrst, 'reload schema';
