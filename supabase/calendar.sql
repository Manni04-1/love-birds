-- Love Birds: plans that last several days, and plans that repeat.
-- Run this in the Supabase SQL Editor after extras.sql. It is safe to run more than once.

-- end_day: the last day of a plan that lasts several days (null for a one-day plan).
-- repeats: how often it comes round. repeat_until: the last day it can start (null for forever).
-- skip_days: start days of single times you skipped, without changing the rest.
alter table public.events add column if not exists end_day date;
alter table public.events add column if not exists repeats text;
alter table public.events add column if not exists repeat_until date;
alter table public.events add column if not exists skip_days date[] not null default '{}';

alter table public.events drop constraint if exists events_end_day;
alter table public.events add constraint events_end_day check (end_day is null or (end_day >= day and end_day - day <= 366));
alter table public.events drop constraint if exists events_repeats;
alter table public.events add constraint events_repeats check (repeats is null or repeats in ('daily', 'weekly', 'fortnightly', 'monthly', 'yearly'));
alter table public.events drop constraint if exists events_repeat_until;
alter table public.events add constraint events_repeat_until check (repeat_until is null or (repeats is not null and repeat_until >= day));
alter table public.events drop constraint if exists events_skip_days;
alter table public.events add constraint events_skip_days check (cardinality(skip_days) <= 500);

-- Plans that repeat or run on into later days are found by these.
create index if not exists events_couple_repeats_idx on public.events (couple_id) where repeats is not null;
create index if not exists events_couple_end_idx on public.events (couple_id, end_day) where end_day is not null;

-- "Added a plan: Diani trip, Fri 21 Nov to Sun 23 Nov" and "…, every week".
create or replace function public.on_plan_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner(
    new.created_by,
    'Added a plan: ' || new.title || ', ' || to_char(new.day, 'Dy FMDD Mon')
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
