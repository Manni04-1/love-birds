-- Love Birds: comments on memories, written on the pages of the memory book.
-- Run this in the Supabase SQL Editor after chimes.sql. It is safe to run more than once.

create table if not exists public.memory_comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories on delete cascade,
  couple_id uuid not null references public.couples on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists memory_comments_memory_idx on public.memory_comments (memory_id, created_at);
create index if not exists memory_comments_couple_idx on public.memory_comments (couple_id);

-- Both of you read every comment on your memories; each of you writes and deletes your own.
alter table public.memory_comments enable row level security;
drop policy if exists "couple reads memory comments" on public.memory_comments;
create policy "couple reads memory comments" on public.memory_comments for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "comment on a memory" on public.memory_comments;
create policy "comment on a memory" on public.memory_comments for insert to authenticated
  with check (
    user_id = auth.uid() and couple_id = public.my_couple_id()
    and exists (select 1 from public.memories m where m.id = memory_id and m.couple_id = public.my_couple_id())
  );
drop policy if exists "delete own memory comment" on public.memory_comments;
create policy "delete own memory comment" on public.memory_comments for delete to authenticated
  using (user_id = auth.uid());
revoke update on public.memory_comments from anon, authenticated;

-- A comment tells your partner, with the start of what you wrote.
create or replace function public.on_memory_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_partner(new.user_id, 'Commented on a memory: ' || left(new.body, 120), '/memories');
  return new;
end $$;

drop trigger if exists notify_memory_comment on public.memory_comments;
create trigger notify_memory_comment after insert on public.memory_comments
  for each row execute function public.on_memory_comment();

-- Live updates, so a new comment appears on the other phone straight away.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memory_comments') then
    alter publication supabase_realtime add table public.memory_comments;
  end if;
end $$;

-- So the app can use the new table straight away.
notify pgrst, 'reload schema';
