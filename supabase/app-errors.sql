-- Love Birds: problem reports. When the app closes unexpectedly or something breaks, the app
-- sends a short note of what went wrong the next time it opens, so it can be fixed.
-- Run this in the Supabase SQL Editor after golden-theme.sql. It is safe to run more than once.

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  couple_id uuid references public.couples on delete cascade,
  kind text not null check (char_length(kind) <= 60),
  message text not null check (char_length(message) <= 2000),
  details text check (char_length(details) <= 16000),
  app_version text check (char_length(app_version) <= 120),
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists app_errors_couple_idx on public.app_errors (couple_id, created_at desc);
create index if not exists app_errors_user_idx on public.app_errors (user_id, created_at desc);

-- Each of you sends your own; both of you can read the couple's; each of you clears your own.
alter table public.app_errors enable row level security;
drop policy if exists "send own problem report" on public.app_errors;
create policy "send own problem report" on public.app_errors for insert to authenticated
  with check (user_id = auth.uid() and (couple_id is null or couple_id = public.my_couple_id()));
drop policy if exists "read problem reports" on public.app_errors;
create policy "read problem reports" on public.app_errors for select to authenticated
  using (user_id = auth.uid() or couple_id = public.my_couple_id());
drop policy if exists "clear own problem report" on public.app_errors;
create policy "clear own problem report" on public.app_errors for delete to authenticated
  using (user_id = auth.uid());
revoke update on public.app_errors from anon, authenticated;
revoke all on public.app_errors from anon;

notify pgrst, 'reload schema';
