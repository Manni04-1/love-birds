-- Love Birds: an icon for each plan.
-- Run this in the Supabase SQL Editor after calendar.sql. It is safe to run more than once.

-- emoji: the plan's emoji, which notifications and widgets show too.
-- glyph: the name of a drawn icon (a Material Symbol) when one was picked instead; emoji then holds the closest emoji.
alter table public.events add column if not exists emoji text;
alter table public.events add column if not exists glyph text;

alter table public.events drop constraint if exists events_emoji;
alter table public.events add constraint events_emoji check (emoji is null or char_length(emoji) between 1 and 16);
alter table public.events drop constraint if exists events_glyph;
alter table public.events add constraint events_glyph check (glyph is null or glyph ~ '^[a-z0-9_]{1,60}$');

-- "Added a plan: 🍽️ Dinner at Talisman, Fri 21 Nov at 7:30 PM", and as before for trips and repeats.
create or replace function public.on_plan_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner(
    new.created_by,
    'Added a plan: ' || coalesce(nullif(new.emoji, '') || ' ', '') || new.title || ', ' || to_char(new.day, 'Dy FMDD Mon')
      || case when new.end_day > new.day then ' to ' || to_char(new.end_day, 'Dy FMDD Mon') else '' end
      || coalesce(' at ' || to_char(new.time, 'FMHH12:MI AM'), '')
      || case new.repeats
           when 'daily' then ', every day'
           when 'weekly' then ', every week'
           when 'fortnightly' then ', every 2 weeks'
           when 'monthly' then ', every month'
           when 'yearly' then ', every year'
           else ''
         end,
    '/calendar?day=' || to_char(new.day, 'YYYY-MM-DD')
  );
  return new;
end $$;

-- So the app can save icons straight away.
notify pgrst, 'reload schema';
