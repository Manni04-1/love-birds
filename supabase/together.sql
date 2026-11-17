-- Love Birds date ideas and games.
-- Run this once after schema.sql and notifications.sql:
-- Dashboard > SQL Editor > New query > paste > Run. It is safe to run again.
--
-- Date ideas: you each swipe through a deck. When you both like the same idea
-- it becomes a match, and the one who liked it first gets a notification.
-- Games: Would you rather and How well do you know me. Your partner's answer
-- stays hidden until you've answered too.
-- Like everything else in Love Birds, only the two of you can see your data.

-- ---------------------------------------------------------------------------
-- Profile: which extra question decks you have switched on
-- ---------------------------------------------------------------------------

-- 0 = off, 1 = flirty, 2 = flirty and erotic. A deck shows only when you have
-- both switched it on, so the app uses the lower of your two settings.
alter table public.profiles add column if not exists heat smallint not null default 0
  check (heat between 0 and 2);

grant update (name, push_token, bubble, heat) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Built-in ideas have a slug and no couple. Your own ideas belong to your couple.
create table if not exists public.date_ideas (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  couple_id uuid references public.couples on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  details text check (char_length(details) <= 500),
  category text not null check (category in ('home', 'out', 'adventure', 'romantic', 'nairobi', 'ours')),
  cost smallint check (cost between 0 and 3),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check ((slug is null) <> (couple_id is null))
);
create index if not exists date_ideas_couple_idx on public.date_ideas (couple_id);

-- Your swipes. Your partner never sees them, only the matches.
create table if not exists public.idea_swipes (
  couple_id uuid not null references public.couples on delete cascade,
  idea_id uuid not null references public.date_ideas on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (couple_id, idea_id, user_id)
);

-- Ideas you both liked, and what became of them.
create table if not exists public.date_matches (
  couple_id uuid not null references public.couples on delete cascade,
  idea_id uuid not null references public.date_ideas on delete cascade,
  matched_at timestamptz not null default now(),
  event_id uuid references public.events on delete set null,
  memory_id uuid references public.memories on delete set null,
  done_on date,
  primary key (couple_id, idea_id)
);

-- Game answers. choice is the option you picked (0 = first). For How well do
-- you know me, guess is what you think your partner picked.
create table if not exists public.game_answers (
  couple_id uuid not null references public.couples on delete cascade,
  game text not null check (game in ('wyr', 'quiz')),
  question_key text not null check (char_length(question_key) between 1 and 40),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  choice smallint not null check (choice between 0 and 5),
  guess smallint check (guess between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (couple_id, question_key, user_id),
  check (game <> 'quiz' or guess is not null)
);

-- ---------------------------------------------------------------------------
-- Privacy rules
-- ---------------------------------------------------------------------------

alter table public.date_ideas enable row level security;
alter table public.idea_swipes enable row level security;
alter table public.date_matches enable row level security;
alter table public.game_answers enable row level security;

drop policy if exists "read built-in and own ideas" on public.date_ideas;
create policy "read built-in and own ideas" on public.date_ideas for select to authenticated
  using (couple_id is null or couple_id = public.my_couple_id());
drop policy if exists "delete own ideas" on public.date_ideas;
create policy "delete own ideas" on public.date_ideas for delete to authenticated
  using (couple_id = public.my_couple_id() and created_by = auth.uid());

-- Swipes are made through swipe_idea(). You can read and clear only your own.
drop policy if exists "read own swipes" on public.idea_swipes;
create policy "read own swipes" on public.idea_swipes for select to authenticated
  using (user_id = auth.uid() and couple_id = public.my_couple_id());
drop policy if exists "clear own swipes" on public.idea_swipes;
create policy "clear own swipes" on public.idea_swipes for delete to authenticated
  using (user_id = auth.uid());

-- Matches are made by swipe_idea(). You both see them, plan them and mark them done.
drop policy if exists "couple reads matches" on public.date_matches;
create policy "couple reads matches" on public.date_matches for select to authenticated
  using (couple_id = public.my_couple_id());
drop policy if exists "couple updates matches" on public.date_matches;
create policy "couple updates matches" on public.date_matches for update to authenticated
  using (couple_id = public.my_couple_id()) with check (couple_id = public.my_couple_id());
drop policy if exists "couple removes matches" on public.date_matches;
create policy "couple removes matches" on public.date_matches for delete to authenticated
  using (couple_id = public.my_couple_id());
revoke update on public.date_matches from anon, authenticated;
grant update (event_id, memory_id, done_on) on public.date_matches to authenticated;

-- Game answers: you read your own directly. Your partner's come through
-- get_game_answers(), which hides them until you've answered the same question.
-- Answers can't be changed once given.
drop policy if exists "read own game answers" on public.game_answers;
create policy "read own game answers" on public.game_answers for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "answer as yourself" on public.game_answers;
create policy "answer as yourself" on public.game_answers for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.my_couple_id());
revoke update on public.game_answers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- The other person in your couple.
create or replace function public.my_partner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
  where p.couple_id = public.my_couple_id() and p.id <> auth.uid()
  limit 1
$$;

-- Like (or pass on) an idea. Returns true when this like makes a new match.
create or replace function public.swipe_idea(p_idea uuid, p_liked boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_couple uuid := public.my_couple_id();
  v_partner uuid := public.my_partner_id();
  v_title text;
  v_new boolean;
begin
  if v_couple is null then raise exception 'Link with your partner first.'; end if;

  select title into v_title from public.date_ideas
  where id = p_idea and (couple_id is null or couple_id = v_couple);
  if v_title is null then raise exception 'That idea isn''t there any more.'; end if;

  insert into public.idea_swipes (couple_id, idea_id, user_id, liked)
  values (v_couple, p_idea, auth.uid(), coalesce(p_liked, false))
  on conflict (couple_id, idea_id, user_id) do update set liked = excluded.liked, created_at = now();

  if not coalesce(p_liked, false) or v_partner is null then return false; end if;
  if not exists (
    select 1 from public.idea_swipes
    where couple_id = v_couple and idea_id = p_idea and user_id = v_partner and liked
  ) then return false; end if;

  insert into public.date_matches (couple_id, idea_id) values (v_couple, p_idea)
  on conflict do nothing
  returning true into v_new;

  if v_new then
    perform public.notify_partner(auth.uid(), 'It''s a match! You both want: ' || v_title || ' 💘', '/matches');
  end if;
  return coalesce(v_new, false);
end $$;

-- Add your own idea. It counts as your like and goes into your partner's deck.
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

  perform public.notify_partner(auth.uid(), 'Added a date idea: ' || left(trim(p_title), 120) || '. Swipe right if you''re in 😉', '/together');
  return v_id;
end $$;

-- Your answers and your partner's for one game. Your partner's choice and guess
-- stay null until you've answered that question yourself.
create or replace function public.get_game_answers(p_game text)
returns table (
  question_key text,
  my_choice smallint,
  my_guess smallint,
  partner_answered boolean,
  partner_choice smallint,
  partner_guess smallint
)
language sql stable security definer set search_path = public as $$
  with who as (select auth.uid() as me, public.my_partner_id() as them, public.my_couple_id() as cid),
  keys as (
    select distinct g.question_key
    from public.game_answers g, who
    where g.couple_id = who.cid and g.game = p_game and g.user_id in (who.me, who.them)
  )
  select k.question_key,
         m.choice,
         m.guess,
         t.user_id is not null,
         case when m.user_id is not null then t.choice end,
         case when m.user_id is not null then t.guess end
  from keys k
  cross join who
  left join public.game_answers m on m.couple_id = who.cid and m.question_key = k.question_key and m.user_id = who.me
  left join public.game_answers t on t.couple_id = who.cid and t.question_key = k.question_key and t.user_id = who.them
$$;

revoke execute on function public.my_partner_id() from public, anon;
revoke execute on function public.swipe_idea(uuid, boolean) from public, anon;
revoke execute on function public.add_date_idea(text, text) from public, anon;
revoke execute on function public.get_game_answers(text) from public, anon;
grant execute on function public.my_partner_id() to authenticated;
grant execute on function public.swipe_idea(uuid, boolean) to authenticated;
grant execute on function public.add_date_idea(text, text) to authenticated;
grant execute on function public.get_game_answers(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications for games
-- ---------------------------------------------------------------------------

-- Tells your partner it's their turn, at most once every three hours per game,
-- so answering ten questions in a row sends one notification, not ten.
create or replace function public.on_game_answered()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.game_answers
    where couple_id = new.couple_id and user_id = new.user_id and game = new.game
      and question_key <> new.question_key and created_at > now() - interval '3 hours'
  ) then
    return new;
  end if;

  perform public.notify_partner(
    new.user_id,
    case new.game
      when 'wyr' then 'Played Would you rather. Your turn to pick 😊'
      else 'Played How well do you know me. Your turn to guess 🤔'
    end,
    case new.game when 'wyr' then '/wyr' else '/quiz' end
  );
  return new;
end $$;

drop trigger if exists notify_game on public.game_answers;
create trigger notify_game after insert on public.game_answers
  for each row execute function public.on_game_answered();

-- ---------------------------------------------------------------------------
-- Live updates for matches
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'date_matches'
  ) then
    alter publication supabase_realtime add table public.date_matches;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Built-in date ideas (running this again updates their wording)
-- ---------------------------------------------------------------------------

insert into public.date_ideas (slug, title, details, category, cost) values
  ('cook-a-dish-from-a-country-you-ve-never-visited', 'Cook a dish from a country you''ve never visited', 'Pick a country together, find a recipe, cook it side by side and eat by candlelight.', 'home', 1),
  ('living-room-picnic', 'Living-room picnic', 'A blanket on the floor, finger food, a playlist you both love and no phones.', 'home', 1),
  ('movie-marathon-with-homemade-snacks', 'Movie marathon with homemade snacks', 'Each of you picks a film the other has never seen. A popcorn bar is mandatory.', 'home', 1),
  ('paint-each-other', 'Paint each other', 'Cheap canvases or paper, 30 minutes on the clock, then swap portraits. Try not to laugh.', 'home', 1),
  ('build-a-blanket-fort', 'Build a blanket fort', 'Pillows, fairy lights, a laptop and a good series. Sleeping in it is optional.', 'home', 0),
  ('spa-night', 'Spa night', 'Face masks, foot soaks, slow massages and soft music.', 'home', 1),
  ('bake-something-from-scratch', 'Bake something from scratch', 'Bread, a cake or mandazi. Decorate it badly on purpose.', 'home', 1),
  ('game-night-for-two', 'Game night for two', 'Cards, a board game or a video game. The loser makes breakfast.', 'home', 0),
  ('write-love-letters-and-read-them-aloud', 'Write love letters and read them aloud', 'Ten minutes each, then swap and read. Keep them in a box.', 'home', 0),
  ('recreate-your-first-date-at-home', 'Recreate your first date at home', 'The same food, the same music, the same outfits if you still have them.', 'home', 1),
  ('make-a-playlist-of-our-songs', 'Make a playlist of our songs', 'Take turns adding songs that remind you of each other, and say why.', 'home', 0),
  ('stargazing-from-the-balcony-or-roof', 'Stargazing from the balcony or roof', 'A blanket, hot tea, a sky map app and plenty of wishes.', 'home', 0),
  ('plan-your-dream-trip', 'Plan your dream trip', 'Pick a place, plan the perfect itinerary, budget it and set a someday date.', 'home', 0),
  ('karaoke-night', 'Karaoke night', 'Lyrics on YouTube, a hairbrush microphone, and duets only.', 'home', 0),
  ('learn-a-dance-from-a-video', 'Learn a dance from a video', 'Salsa, bachata or a TikTok routine. Film the final take.', 'home', 0),
  ('breakfast-in-bed', 'Breakfast in bed', 'One of you cooks while the other stays in bed. Swap next week.', 'home', 1),
  ('photo-album-night', 'Photo album night', 'Go through old photos, pick your favourites and add them to Memories.', 'home', 0),
  ('do-a-1-000-piece-puzzle', 'Do a 1,000-piece puzzle', 'Put on a podcast and finish it together, however long it takes.', 'home', 1),
  ('plant-something-together', 'Plant something together', 'Herbs on the windowsill or a small tree. Watch it grow with you.', 'home', 1),
  ('have-a-yes-day', 'Have a yes day', 'One of you says yes to every reasonable plan the other suggests, all day.', 'home', 0),
  ('try-a-restaurant-neither-of-you-knows', 'Try a restaurant neither of you knows', 'Pick a cuisine at random and order something new.', 'out', 2),
  ('sunset-walk-with-ice-cream', 'Sunset walk with ice cream', 'Find a spot with a view, walk slowly and talk about your week.', 'out', 1),
  ('go-to-a-live-music-night', 'Go to a live music night', 'Jazz, acoustic or a local band. Dance at least once.', 'out', 2),
  ('bookshop-date', 'Bookshop date', 'Pick a book for each other under a set budget, then read the first page aloud over coffee.', 'out', 1),
  ('coffee-shop-crawl', 'Coffee shop crawl', 'Three cafés, one drink each, and rate them together.', 'out', 2),
  ('cinema-date', 'Cinema date', 'Back row, shared popcorn and a proper review afterwards.', 'out', 2),
  ('picnic-in-a-park', 'Picnic in a park', 'Pack a basket, a blanket and a card game.', 'out', 1),
  ('visit-a-museum-or-gallery', 'Visit a museum or gallery', 'Each of you picks a favourite piece and explains why.', 'out', 1),
  ('go-bowling-or-play-pool', 'Go bowling or play pool', 'Small bets only: the loser pays for dessert.', 'out', 2),
  ('take-a-cooking-class-together', 'Take a cooking class together', 'Learn a new dish from a pro, then cook it again at home.', 'out', 3),
  ('dress-up-for-a-fancy-dinner', 'Dress up for a fancy dinner', 'Your best outfits, a nice restaurant and no phones on the table.', 'out', 3),
  ('wander-a-market', 'Wander a market', 'Try a snack you''ve never had and buy each other a small gift.', 'out', 1),
  ('comedy-night', 'Comedy night', 'Find a stand-up or open-mic night and laugh together.', 'out', 2),
  ('slow-weekend-brunch', 'Slow weekend brunch', 'Take your time over brunch, then go for a walk.', 'out', 2),
  ('photo-walk', 'Photo walk', 'Walk around the city taking photos of each other and the things you notice.', 'out', 0),
  ('volunteer-together-for-a-day', 'Volunteer together for a day', 'A children''s home, an animal shelter or a clean-up.', 'out', 0),
  ('watch-a-football-match-together', 'Watch a football match together', 'At the stadium or a lively sports bar. Pick a team each.', 'out', 2),
  ('rooftop-drinks', 'Rooftop drinks', 'Find a rooftop and watch the city lights come on.', 'out', 2),
  ('go-to-a-food-festival', 'Go to a food festival', 'Share small plates and vote on the best bite.', 'out', 2),
  ('sunrise-hike', 'Sunrise hike', 'Start in the dark, watch the sun come up from the top, then have breakfast.', 'adventure', 1),
  ('day-trip-somewhere-new', 'Day trip somewhere new', 'Pick a town within two hours and go without a plan.', 'adventure', 2),
  ('go-camping-for-a-night', 'Go camping for a night', 'A tent, a fire, the stars and your best stories.', 'adventure', 2),
  ('try-a-sport-you-ve-never-played', 'Try a sport you''ve never played', 'Tennis, climbing, skating or a swimming lesson.', 'adventure', 2),
  ('rent-bikes-and-ride-a-trail', 'Rent bikes and ride a trail', 'Pack snacks and stop wherever looks good.', 'adventure', 2),
  ('go-horse-riding', 'Go horse riding', 'Many stables offer gentle rides for beginners.', 'adventure', 3),
  ('indoor-rock-climbing', 'Indoor rock climbing', 'Belay each other and cheer loudly.', 'adventure', 2),
  ('road-trip-with-a-playlist', 'Road trip with a playlist', 'Each of you brings five songs, and no skipping.', 'adventure', 2),
  ('go-on-a-boat-ride', 'Go on a boat ride', 'A lake, a river or the sea. Bring a camera.', 'adventure', 2),
  ('go-karting-or-paintball', 'Go-karting or paintball', 'A little competition is healthy.', 'adventure', 2),
  ('swim-somewhere-new', 'Swim somewhere new', 'A pool, a lake or the ocean. Race once.', 'adventure', 1),
  ('do-a-fun-run-together', 'Do a fun run together', 'Sign up for a 5K, train together and cross the line holding hands.', 'adventure', 1),
  ('geocaching-treasure-hunt', 'Geocaching treasure hunt', 'Use a geocaching app to find hidden boxes near you.', 'adventure', 0),
  ('zip-lining', 'Zip-lining', 'Scream together.', 'adventure', 3),
  ('spend-a-night-somewhere-unusual', 'Spend a night somewhere unusual', 'A treehouse, a cabin or a tented lodge.', 'adventure', 3),
  ('chase-a-waterfall', 'Chase a waterfall', 'Find one within a day''s drive and swim if it''s safe.', 'adventure', 1),
  ('candlelit-dinner-at-home', 'Candlelit dinner at home', 'Cook together, dim the lights and slow dance after dessert.', 'romantic', 1),
  ('twenty-things-i-love-about-you', 'Twenty things I love about you', 'Each of you writes a list, then swap and read them aloud.', 'romantic', 0),
  ('return-to-where-you-met', 'Return to where you met', 'Go back to the place you met and tell the story from both sides.', 'romantic', 1),
  ('a-surprise-date', 'A surprise date', 'One of you plans everything. The other only gets a dress code.', 'romantic', 2),
  ('slow-dance-in-the-kitchen', 'Slow dance in the kitchen', 'Your song, no reason, any time.', 'romantic', 0),
  ('sunset-from-somewhere-high', 'Sunset from somewhere high', 'A rooftop, a hill or a viewpoint. Bring something warm.', 'romantic', 0),
  ('make-a-time-capsule', 'Make a time capsule', 'Write letters to each other to open in a year.', 'romantic', 0),
  ('weekend-getaway', 'Weekend getaway', 'Somewhere quiet, just the two of you.', 'romantic', 3),
  ('couple-portraits-at-golden-hour', 'Couple portraits at golden hour', 'Book a photographer or set up a tripod as the sun goes down.', 'romantic', 2),
  ('deep-questions-night', 'Deep questions night', 'Open a Talk deck in Games and take your time with each card.', 'romantic', 0),
  ('massage-night', 'Massage night', 'Warm oil, soft music and no rush.', 'romantic', 1),
  ('write-a-song-or-poem-for-each-other', 'Write a song or poem for each other', 'It doesn''t have to be good. It has to be yours.', 'romantic', 0),
  ('breakfast-at-sunrise', 'Breakfast at sunrise', 'Watch the sun come up with coffee and something sweet.', 'romantic', 1),
  ('act-out-a-film-scene', 'Act out a film scene', 'Pick a romantic scene from a favourite film and play it out.', 'romantic', 0),
  ('a-night-at-a-nice-hotel', 'A night at a nice hotel', 'Room service, robes and no plans.', 'romantic', 3),
  ('love-note-scavenger-hunt', 'Love-note scavenger hunt', 'Hide notes around the house or the city that lead to a final surprise.', 'romantic', 0),
  ('dinner-with-a-view', 'Dinner with a view', 'Find a restaurant with a skyline or garden view.', 'romantic', 3),
  ('read-to-each-other-in-bed', 'Read to each other in bed', 'Pick a book and read a chapter each night.', 'romantic', 0),
  ('walk-or-cycle-in-karura-forest', 'Walk or cycle in Karura Forest', 'Follow the trails to the waterfall and the caves, then picnic by the lake.', 'nairobi', 1),
  ('game-drive-in-nairobi-national-park', 'Game drive in Nairobi National Park', 'Lions with the city skyline behind them. Go early in the morning.', 'nairobi', 2),
  ('feed-giraffes-at-the-giraffe-centre', 'Feed giraffes at the Giraffe Centre', 'Hand-feed the Rothschild giraffes in Langata, then walk the nature trail.', 'nairobi', 1),
  ('visit-the-baby-elephants-at-sheldrick', 'Visit the baby elephants at Sheldrick', 'The David Sheldrick Wildlife Trust has a morning visiting hour. Foster one together.', 'nairobi', 1),
  ('picnic-at-the-nairobi-arboretum', 'Picnic at the Nairobi Arboretum', 'Shade, birdsong and a blanket under old trees.', 'nairobi', 0),
  ('hike-the-ngong-hills', 'Hike the Ngong Hills', 'Rolling peaks with wide views over the Rift Valley. Go with a group or a guide.', 'nairobi', 1),
  ('shop-the-maasai-market', 'Shop the Maasai Market', 'Pick a small handmade gift for each other.', 'nairobi', 1),
  ('cycle-through-hell-s-gate', 'Cycle through Hell''s Gate', 'A day trip to Naivasha: ride past zebras and walk the gorge.', 'nairobi', 2),
  ('boat-ride-on-lake-naivasha', 'Boat ride on Lake Naivasha', 'Look for hippos and fish eagles, then have lunch by the lake.', 'nairobi', 2),
  ('oloolua-nature-trail-in-karen', 'Oloolua Nature Trail in Karen', 'A quiet forest walk with a waterfall and a cave.', 'nairobi', 1),
  ('day-out-at-paradise-lost', 'Day out at Paradise Lost', 'Caves, a waterfall and a boat on the lake, just outside the city.', 'nairobi', 1),
  ('watch-glass-blowing-at-kitengela-glass', 'Watch glass-blowing at Kitengela Glass', 'Colourful, quirky and a nice drive out of town.', 'nairobi', 1),
  ('cultural-show-at-bomas-of-kenya', 'Cultural show at Bomas of Kenya', 'Dances from across Kenya. Join in when they invite the audience.', 'nairobi', 1),
  ('karen-blixen-museum-and-afternoon-tea', 'Karen Blixen Museum and afternoon tea', 'Wander the old farmhouse and gardens, then find tea nearby in Karen.', 'nairobi', 1)

on conflict (slug) do update
  set title = excluded.title, details = excluded.details, category = excluded.category, cost = excluded.cost;
