-- Love Birds: the Roo & Panda theme.
-- Run this in the Supabase SQL Editor after app-errors.sql. It is safe to run more than once.

-- Let profiles.theme hold 'roo' as well as the earlier themes.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%theme%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_theme_check
  check (theme in ('rose', 'steampunk', 'meadow', 'serengeti', 'diani', 'starry', 'golden', 'roo'));

notify pgrst, 'reload schema';
