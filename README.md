# Love Birds

A private app for two: a shared calendar, a chat, a timeline of memories and photos, and a daily question you both answer. One app for iPhone and Android, built with [Expo](https://expo.dev) and [Supabase](https://supabase.com).

## Try it on your phones (about 20 minutes, free)

### 1. Set up the database

1. Create a free account at [supabase.com](https://supabase.com) and make a new project. Pick the region closest to you.
2. In the project, open **SQL Editor**, click **New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. It should say "Success".
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
| Home | Days together, today's question, next plan, latest memory |
| Daily question | One question a day for both of you. Your partner's answer stays hidden until you've answered too |
| Calendar | Month view, add plans with date, time and a note, long press to delete. Updates live when your partner adds something |
| Chat | Text and photos, tap a message to heart it, "Seen" receipts, live updates |
| Memories | Photo, caption, date and place, "Love" a memory, long press your own to delete |
| Settings | Change your name and your together-since date, sign out, unlink, delete account |

Privacy: every table has row-level security, so only the two people in a couple can read its data. Photos sit in a private storage bucket, one folder per couple, and open through short-lived links.

## Not built yet

- Push notifications and plan reminders (needs `expo-notifications` and a development build)
- App lock with Face ID or a PIN (`expo-local-authentication`)
- Sign in with Apple and Google
- Working offline
- Store builds for the App Store and Google Play (with [EAS Build](https://docs.expo.dev/build/introduction/))
- Date ideas, games and the other extras planned for later

## For developers

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
```

- Screens live in `src/app` (Expo Router). `(tabs)` holds Home, Calendar, Chat and Memories.
- `src/lib/session.tsx` loads the signed-in person, their couple and their partner. The root layout uses `Stack.Protected` to show sign-in, partner linking or the app.
- `src/lib/supabase.ts` creates the client from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Database changes go in `supabase/schema.sql`.
- `src/lib/updates.ts` handles over-the-air updates. The runtime version follows `version` in `app.json`, so raise it whenever a native package changes.
