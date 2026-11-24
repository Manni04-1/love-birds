# Love Birds

A private app for two: a shared calendar, a chat, a timeline of memories and photos, and a daily question you both answer. One app for iPhone and Android, built with [Expo](https://expo.dev) and [Supabase](https://supabase.com).

## Try it on your phones (about 20 minutes, free)

### 1. Set up the database

1. Create a free account at [supabase.com](https://supabase.com) and make a new project. Pick the region closest to you.
2. In the project, open **SQL Editor**, click **New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. It should say "Success". Then do the same with [`supabase/notifications.sql`](supabase/notifications.sql), then [`supabase/together.sql`](supabase/together.sql), [`supabase/daily.sql`](supabase/daily.sql), [`supabase/engage.sql`](supabase/engage.sql), [`supabase/extras.sql`](supabase/extras.sql), [`supabase/calendar.sql`](supabase/calendar.sql), [`supabase/plan-icons.sql`](supabase/plan-icons.sql), [`supabase/chimes.sql`](supabase/chimes.sql), [`supabase/photo-likes.sql`](supabase/photo-likes.sql), [`supabase/memory-comments.sql`](supabase/memory-comments.sql), [`supabase/golden-theme.sql`](supabase/golden-theme.sql), [`supabase/app-errors.sql`](supabase/app-errors.sql), [`supabase/roo-theme.sql`](supabase/roo-theme.sql), and then [`supabase/chat-extras.sql`](supabase/chat-extras.sql).
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
4. On each phone, open [the download link](https://github.com/Manni04-1/love-birds/releases/download/android-latest/love-birds.apk), open the file, and allow your browser to install apps when Android asks. Your data stays when you install a newer file over the old one. Version 1.4.0 is the first signed with the app's own key (see [The signing key](#the-signing-key)), so the first time, uninstall the old app before installing it. Your chats, photos and plans stay online, but you sign in and set up the app lock again.

### Forgot password emails

**Forgot password?** on the sign-in screen emails a code. Supabase's built-in email only reaches people on your Supabase team, so send through a Gmail account instead. It's free and done once:

1. Choose the Gmail account the emails come from. In its Google Account, turn on **2-Step Verification**, then open [App passwords](https://myaccount.google.com/apppasswords), make one called Supabase and copy it. Keep it private.
2. In Supabase, open **Authentication > Emails > SMTP Settings**, turn on custom SMTP and fill in: sender email and username = that Gmail address, sender name = Love Birds, host `smtp.gmail.com`, port `465`, password = the app password. Save.
3. Open **Authentication > Emails > Templates > Reset password**, set the subject to "Your Love Birds code", paste [`supabase/reset-password-email.html`](supabase/reset-password-email.html) as the body, and save.

Gmail sends up to 500 emails a day this way. **Settings > Change password** works without any of this.

### Notifications

Android delivers notifications through Firebase. Once:

1. At [console.firebase.google.com](https://console.firebase.google.com), create a project. Add an Android app with package name `io.github.manni041.lovebirds`, download `google-services.json` and put it in this folder (it ships inside the app, so it's fine to commit).
2. In Firebase, open **Project settings > Service accounts** and generate a new private key. Keep this file private.
3. On [expo.dev](https://expo.dev), open the project, then **Credentials > Android**, and upload that key under **FCM V1 service account key**.
4. Run [`supabase/notifications.sql`](supabase/notifications.sql) in the Supabase SQL Editor if you haven't yet.

The database sends a notification through Expo when one of you sends a message, adds a plan or memory, answers the daily question or hearts something. Plan reminders (an hour before, or 9 AM for all-day plans) are scheduled on each phone. Every notification plays [`assets/sounds/love.wav`](assets/sounds/love.wav). Opening the app (once you're past the app lock, if you use one) clears its notifications from the phone's list, since everything they say is in the app. **Settings > Notifications > Send me a test** checks the whole chain.

### Automatic updates

Once the app is installed, most changes reach the phones by themselves through [EAS Update](https://docs.expo.dev/eas-update/introduction/). The app looks for a new version when it opens, downloads it in the background and offers to restart. **Settings > Check for updates** does the same on demand.

To turn this on, once:

1. Create a free account at [expo.dev](https://expo.dev).
2. Open [Access tokens](https://expo.dev/settings/access-tokens), create a token and copy it.
3. In this repository, open **Settings > Secrets and variables > Actions > New repository secret**, name it `EXPO_TOKEN` and paste the token.

The next build on `main` links the app to an Expo project, and from then on every push to `main` also sends an update. Changes to native packages can't travel this way: when you add or upgrade one, raise `version` in `app.json` so the phones install the new file from the download link instead.

### The signing key

Android only lets a new file update an installed app if both are signed with the same key. Builds from `main` are signed with Love Birds' own private key, which is kept on expo.dev as the sensitive environment variable `ANDROID_SIGNING_KEY` in the production environment (the project's **Environment variables** page). The first build on `main` that needed it made it, with [`.github/scripts/signing-key.sh`](.github/scripts/signing-key.sh). Keep a copy somewhere private, and never delete or change the variable: without it, the next file can't update the app on the phones, and both would have to uninstall again. Pull request builds use Android's public debug key, so they can't install over the real app.

## What's in this version

| Feature | What works |
| --- | --- |
| Accounts | Sign up and sign in with email and password. Change your password in Settings, or set a new one with a code by email if you forget it (see [Forgot password emails](#forgot-password-emails)) |
| Partner linking | 6-character invite code, valid for 24 hours, works once |
| Home | An animated picture for your theme, days together with anniversaries and every hundredth day, today's rituals with a progress count, a countdown to your next plan, and your latest memory |
| Thinking of you | One tap makes your partner's phone buzz with a heartbeat and the love chime. If they have the app open they see it straight away |
| Mood | Pick an emoji and a word for how you feel today. It shows on your partner's Home, and they get a notification the first time each day |
| Daily question | One question a day for both of you. Your partner's answer stays hidden until you've answered too. You can change your answer once, marked as edited |
| Rose, thorn and bud | An evening check-in: the best bit of your day, the hard bit, and something you're looking forward to. Hidden until you've both shared |
| Photo of the day | One photo from your day each, from the camera or the gallery. Your partner's stays hidden until you've added yours. You can swap yours the same day. Double tap your partner's photo (or tap the heart) to like it, which sends them a notification; tap a photo to see it full screen |
| Sweet gesture | A small idea each day for something kind to do. You each get a different one, so it stays a surprise |
| Themes | Rose, Steampunk, Meadow, Serengeti, Diani Beach, Starry Night, Golden Hour and Roo & Panda, each with a light and a dark look. You each pick your own |
| Calendar | Month view, add plans with date, time and a note, long press to delete. Updates live when your partner adds something |
| Chat | Text, photos and voice notes (tap the mic, up to 5 minutes), double tap a message to heart it, hold it to react (the reaction you pick floats up both screens), "Seen" receipts, live updates. Each of you picks a bubble: fuchsia with hearts, or thorny vines and roses |
| Home-screen widgets (Android) | Love Birds (4 × 2): your animals, days together, how your partner feels and your next plan. Countdown (2 × 2): days to go until your next plan. Thinking of you (2 × 1): one tap sends the heartbeat. Add them from Settings or from your home screen's widget list. With private notifications on, they leave out plan names and mood words |
| Save photos | Open any photo full screen and tap Save to put a copy in your phone's gallery |
| Notifications | A chime for messages, hearts, new plans and memories, and daily answers. Each of you picks the chime your own phone plays in **Settings > Notifications > Chime**: the original Love birds, Birdsong, Music box, Harp, Kalimba, Marimba, Steel pan, Soft piano, Ukulele, Wind chimes, Crystal, Sparkle, Ding-dong, Bubbles, Whistle or Heartbeat, your phone's own sound, or vibrate only. Reminders an hour before plans, and an evening reminder at 8 PM for your rose, thorn and bud (skipped once you've checked in, and you can switch it off) |
| Memories | Photo, caption, date and place, "Love" a memory, long press your own to delete. **Book** (the first view) shows them as a photo album, oldest first after a cover: swipe or tap the arrows to turn a page, which folds over from its spine. Each page has the photo taped in, the caption in handwriting, and comments from both of you (a comment notifies the other person; hold your own to delete it). Timeline, Photos and Places are the other views |
| Date ideas | A deck of about 90 ideas (at home, going out, adventure, romantic and around Nairobi) to swipe right or left. When you both like one it's a match, with a notification. Plan a match straight into the calendar, then save it as a memory after the date. Add your own ideas, filter by type or free, and tap Surprise me |
| Games | Would you rather and How well do you know me (with a score both ways): your partner's answers stay hidden until you've answered too. Talk decks to pull cards from: Light, Deep, Flirty and Erotic |
| After dark | Flirty and Erotic questions appear only once you have both switched them on in Settings. The app only shows what's on for you both |
| App lock | A 4-digit PIN, with fingerprint unlock if the phone has one. Locks right away, after 1 minute or after 5 minutes away. After five wrong PINs you wait a minute, then longer. Forgot PIN signs you out, which removes the lock. The PIN is kept in the phone's secure storage and never leaves it |
| Settings | Change your name, your theme, the app lock, your bubble, your together-since date and After dark, the evening reminder, test notifications, check for updates, sign out, unlink, delete account |
| Problem reports | If the app closes by itself or something breaks, it notes down what went wrong (including Android's own record of crashes) and sends it to the `app_errors` table next time it opens. **Settings > Problem reports** lists the couple's recent reports; tap one to copy it |
| Smaller uploads | Photos are shrunk before they upload (long side at most 2048 pixels, JPEG), about five times smaller, and voice notes record at 32 kbps. Photos already sent stay as they are |

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
- `supabase/calendar.sql` lets a plan last several days (`end_day`) and repeat (`repeats`, `repeat_until`, and `skip_days` for the times you skip). The app works out each time a plan comes round in `src/lib/plans.ts`, so the calendar, Home and the reminders on each phone all use that rather than `events.day` alone.
- Chimes: `src/lib/chimes.ts` lists them, the files are in `assets/sounds` and in the `sounds` list of the expo-notifications plugin in `app.json` (so a new chime needs a new `version` and a reinstall). Android fixes a notification channel's sound when the channel is made, so each chime has its own channel (`love` for the original, `love-<chime>` for the rest). `src/lib/notifications.ts` makes the chosen chime's channel before saving `profiles.chime`, keeps only that channel and moves reminders onto it, and `push_to` in `supabase/chimes.sql` sends each notification through the recipient's channel. The sounds were made from scratch with simple physical models (no samples).
- `src/lib/theme.ts` holds the six themes' colours and the fonts (Bricolage Grotesque for headings, Nunito Sans for text). `src/components/hero.tsx` draws each theme's moving picture.
- `src/lib/lock.ts` keeps the app lock in `expo-secure-store` (a salted SHA-256 of the PIN, the fingerprint choice and the wrong-PIN count). `src/components/app-lock.tsx` shows the lock screen and the PIN setup. Wrap anything that leaves the app on purpose (pickers, permission prompts) in `whileAway()` so it doesn't lock.
- The app icon, splash and notification icon are drawn from one SVG mark (two love birds making a heart). `src/components/mark.tsx` draws the same mark inside the app.
- `src/widgets` draws the Android home-screen widgets with `react-native-android-widget`. `index.ts` (the app's entry) registers the background task in `task.ts`, which Android runs to draw a widget and when someone taps Thinking of you. The app keeps what the widgets show in AsyncStorage (`data.ts`) and refreshes it when it opens and each time you leave it (`sync.android.ts`). Widget names and sizes are in the plugin settings in `app.json`; keep the names, because placed widgets are found by them. The pictures in the widget list are `assets/widgets/*.png`.
- Voice notes (`src/components/voice.tsx`, `src/lib/voice.ts`) are recorded with `expo-audio` as mono AAC and uploaded to the couple's folder in the `photos` bucket under `voice/`, then sent as a message with `audio_path` and `audio_ms`. Saving a photo (`savePhoto` in `src/lib/photos.ts`) asks only to add photos, not to read the gallery.
- `src/lib/updates.ts` handles over-the-air updates. The runtime version follows `version` in `app.json`, so raise it whenever a native package changes.
