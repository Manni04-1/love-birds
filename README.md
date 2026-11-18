# Love Birds

A private app for two: a shared calendar, a chat, a timeline of memories and photos, and a daily question you both answer. One app for iPhone and Android, built with [Expo](https://expo.dev) and [Supabase](https://supabase.com).

## Try it on your phones (about 20 minutes, free)

### 1. Set up the database

1. Create a free account at [supabase.com](https://supabase.com) and make a new project. Pick the region closest to you.
2. In the project, open **SQL Editor**, click **New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. It should say "Success". Then do the same with [`supabase/notifications.sql`](supabase/notifications.sql), then [`supabase/together.sql`](supabase/together.sql), [`supabase/daily.sql`](supabase/daily.sql), [`supabase/engage.sql`](supabase/engage.sql), and then [`supabase/extras.sql`](supabase/extras.sql).
3. While you're testing, turn off email confirmation so you can sign in straight away: **Authentication > Sign In / Providers > Email**, switch off **Confirm email**, and save. Turn it back on before you invite other couples.

### 2. Connect the app to the database

1. In Supabase, open **Project Settings > API** (or click **Connect**) and copy the **Project URL** and the **anon / publishable key**.
2. In this folder, copy `.env.example` to a new file called `.env` and paste the two values in.

### 3. Run it

You need [Node.js](https://nodejs.org) 20 or newer on your computer.

```bash
npm install
npx expo start
```

Install **Expo Go** from the App Store or Google Play on both phones. Scan the QR code from the terminal (iPhone: with the Camera app; Android: inside Expo Go). Your phone and computer need to be on the same Wi-Fi. If they can't be, run `npx expo start --tunnel` instead.

Then on one phone, create an account and tap **Invite my partner**. On the other phone, create an account, tap **I have a code** and enter the code.

## Install it on Android phones

GitHub builds an installable app every time the code on `main` changes (see [`.github/workflows/android.yml`](.github/workflows/android.yml)).

1. Do step 1 above (set up Supabase).
2. The build connects to the Supabase project named in [`.github/workflows/android.yml`](.github/workflows/android.yml). To use a different project, add the repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` under **Settings > Secrets and variables > Actions > Variables**.
3. Open **Actions > Android app > Run workflow**. The build takes about 20 to 30 minutes.
4. On each phone, open [the download link](https://github.com/Manni04-1/love-birds/releases/download/android-latest/love-birds.apk), open the file, and allow your browser to install apps when Android asks. Your data stays when you install a newer file over the old one.

### Notifications

Android delivers notifications through Firebase. Once:

1. At [console.firebase.google.com](https://console.firebase.google.com), create a project. Add an Android app with package name `io.github.manni041.lovebirds`, download `google-services.json` and put it in this folder (it ships inside the app, so it's fine to commit).
2. In Firebase, open **Project settings > Service accounts** and generate a new private key. Keep this file private.
3. On [expo.dev](https://expo.dev), open the project, then **Credentials > Android**, and upload that key under **FCM V1 service account key**.
4. Run [`supabase/notifications.sql`](supabase/notifications.sql) in the Supabase SQL Editor if you haven't yet.

The database sends a notification through Expo when one of you sends a message, adds a plan or memory, answers the daily question or hearts something. Plan reminders (an hour before, or 9 AM for all-day plans) are scheduled on each phone. Every notification plays [`assets/sounds/love.wav`](assets/sounds/love.wav). **Settings > Notifications > Send me a test** checks the whole chain.

### Automatic updates

Once the app is installed, most changes reach the phones by themselves through [EAS Update](https://docs.expo.dev/eas-update/introduction/). The app looks for a new version when it opens, downloads it in the background and offers to restart. **Settings > Check for updates** does the same on demand.

To turn this on, once:

1. Create a free account at [expo.dev](https://expo.dev).
2. Open [Access tokens](https://expo.dev/settings/access-tokens), create a token and copy it.
3. In this repository, open **Settings > Secrets and variables > Actions > New repository secret**, name it `EXPO_TOKEN` and paste the token.

The next build on `main` links the app to an Expo project, and from then on every push to `main` also sends an update. Changes to native packages can't travel this way: when you add or upgrade one, raise `version` in `app.json` so the phones install the new file from the download link instead.

## What's in this version

| Feature | What works |
| --- | --- |
| Accounts | Sign up and sign in with email and password |
| Partner linking | 6-character invite code, valid for 24 hours, works once |
| Home | An animated picture for your theme, days together with anniversaries and every hundredth day, today's rituals with a progress count, a countdown to your next plan, and your latest memory |
| Thinking of you | One tap makes your partner's phone buzz with a heartbeat and the love chime. If they have the app open they see it straight away |
| Mood | Pick an emoji and a word for how you feel today. It shows on your partner's Home, and they get a notification the first time each day |
| Daily question | One question a day for both of you. Your partner's answer stays hidden until you've answered too. You can change your answer once, marked as edited |
| Rose, thorn and bud | An evening check-in: the best bit of your day, the hard bit, and something you're looking forward to. Hidden until you've both shared |
| Photo of the day | One photo from your day each, from the camera or the gallery. Your partner's stays hidden until you've added yours. You can swap yours the same day |
| Sweet gesture | A small idea each day for something kind to do. You each get a different one, so it stays a surprise |
| Themes | Rose, Steampunk, Meadow, Serengeti, Diani Beach and Starry Night, each with a light and a dark look. You each pick your own |
| Calendar | Month view, add plans with date, time and a note, long press to delete. Updates live when your partner adds something |
| Chat | Text and photos, tap a message to heart it, "Seen" receipts, live updates. Each of you picks a bubble: fuchsia with hearts, or thorny vines and roses |
| Notifications | A soft love chime for messages, hearts, new plans and memories, and daily answers. Reminders an hour before plans, and an evening reminder at 8 PM for your rose, thorn and bud (skipped once you've checked in, and you can switch it off) |
| Memories | Photo, caption, date and place, "Love" a memory, long press your own to delete |
| Date ideas | A deck of about 90 ideas (at home, going out, adventure, romantic and around Nairobi) to swipe right or left. When you both like one it's a match, with a notification. Plan a match straight into the calendar, then save it as a memory after the date. Add your own ideas, filter by type or free, and tap Surprise me |
| Games | Would you rather and How well do you know me (with a score both ways): your partner's answers stay hidden until you've answered too. Talk decks to pull cards from: Light, Deep, Flirty and Erotic |
| After dark | Flirty and Erotic questions appear only once you have both switched them on in Settings. The app only shows what's on for you both |
| App lock | A 4-digit PIN, with fingerprint unlock if the phone has one. Locks right away, after 1 minute or after 5 minutes away. After five wrong PINs you wait a minute, then longer. Forgot PIN signs you out, which removes the lock. The PIN is kept in the phone's secure storage and never leaves it |
| Settings | Change your name, your theme, the app lock, your bubble, your together-since date and After dark, the evening reminder, test notifications, check for updates, sign out, unlink, delete account |

Privacy: every table has row-level security, so only the two people in a couple can read its data. Photos sit in a private storage bucket, one folder per couple, and open through short-lived links.

## Not built yet

- Sign in with Apple and Google
- Working offline
- Store builds for the App Store and Google Play (with [EAS Build](https://docs.expo.dev/build/introduction/))

## For developers

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
```

- Screens live in `src/app` (Expo Router). `(tabs)` holds Home, Calendar, Chat, Together and Memories.
- `src/lib/session.tsx` loads the signed-in person, their couple and their partner. The root layout uses `Stack.Protected` to show sign-in, partner linking or the app.
- `src/lib/supabase.ts` creates the client from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Database changes go in `supabase/schema.sql`.
- `src/lib/notifications.ts` registers for push, schedules plan reminders and opens the right screen when a notification is tapped. `supabase/notifications.sql` holds the triggers that send them. `src/components/love-bubble.tsx` draws the two chat bubbles.
- `supabase/together.sql` holds date ideas (with the built-in ideas), swipes, matches and game answers. Game questions live in `src/content/games.ts`: keep each question's key when you reword it, and give new questions new keys.
- `supabase/daily.sql` holds moods, thinking-of-you taps, check-ins, photos of the day, the theme column and answer editing. `src/lib/daily.ts` reads and saves them, and `src/components/daily.tsx` draws them on Home. Moods and sweet gestures live in `src/content`.
- `supabase/extras.sql` holds Tonight (swipe to decide), shared lists, Home safe, chat stickers, private notifications, wishlists with secret claims, your story's milestones, love coupons, time capsules, trip funds and the monthly recap, with their notifications and the two scheduled jobs (time capsules every 15 minutes, the recap at 9 AM Nairobi time on the 1st). Each new screen lives in `src/app` under its own name (`tonight`, `lists`, `wishlist`, `our-story`, `coupons`, `trip-fund`, `recap`, `chat-search`). Tonight's options, coupons, story ideas and sticker captions live in `src/content`: keep their keys when you reword them.
- `src/lib/theme.ts` holds the six themes' colours and the fonts (Bricolage Grotesque for headings, Nunito Sans for text). `src/components/hero.tsx` draws each theme's moving picture.
- `src/lib/lock.ts` keeps the app lock in `expo-secure-store` (a salted SHA-256 of the PIN, the fingerprint choice and the wrong-PIN count). `src/components/app-lock.tsx` shows the lock screen and the PIN setup. Wrap anything that leaves the app on purpose (pickers, permission prompts) in `whileAway()` so it doesn't lock.
- The app icon, splash and notification icon are drawn from one SVG mark (two love birds making a heart). `src/components/mark.tsx` draws the same mark inside the app.
- `src/lib/updates.ts` handles over-the-air updates. The runtime version follows `version` in `app.json`, so raise it whenever a native package changes.
