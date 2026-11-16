import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False until the .env file has the Supabase project's URL and key. */
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'https://not-configured.supabase.co', anonKey || 'not-configured', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the sign-in fresh only while the app is open.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turns a Supabase error into a sentence a person can act on. */
export function friendlyError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (!message) return 'Something went wrong. Check your connection and try again.';
  if (/network request failed|fetch failed/i.test(message)) return 'No connection. Check your internet and try again.';
  if (/invalid login credentials/i.test(message)) return 'That email and password don\'t match. Try again.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first. We sent you a link.';
  if (/already registered/i.test(message)) return 'There\'s already an account with this email. Sign in instead.';
  return message;
}
