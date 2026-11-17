import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { parseISODate, timeLabel, toISODate, today } from './dates';
import { supabase } from './supabase';
import type { Plan } from './types';

/** The Android channel every Love Birds notification uses, with the love.wav chime. */
export const CHANNEL = 'love';
const SOUND = 'love.wav';

// True while the chat is on screen, so new messages don't also pop up as notifications.
let chatOpen = false;
export function setChatOpen(open: boolean) {
  chatOpen = open;
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const quiet = chatOpen && n.request.content.data?.url === '/chat';
      return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !quiet, shouldSetBadge: false };
    },
  });
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Love notes',
    description: 'Messages, plans, memories, answers and reminders',
    importance: AndroidImportance.HIGH,
    sound: SOUND,
    vibrationPattern: [0, 110, 130, 110], // a heartbeat
    lightColor: '#E0218A',
  });
}

/**
 * - on: notifications work, including ones from your partner.
 * - reminders-only: allowed, but this phone couldn't get a push address, so only plan reminders work.
 * - off: not allowed yet. The app can ask.
 * - blocked: turned off in Android settings. Only the person can turn them back on there.
 */
export type NotificationStatus = 'on' | 'reminders-only' | 'off' | 'blocked';

/** Asks for permission (if `ask`), then saves this phone's push address to your profile. */
export async function enableNotifications(userId: string, ask: boolean): Promise<NotificationStatus> {
  if (Platform.OS === 'web') return 'reminders-only';
  await ensureChannel();

  let perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted' && ask && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (perm.status !== 'granted') return perm.canAskAgain ? 'off' : 'blocked';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!Device.isDevice || !projectId) return 'reminders-only';
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
    return error ? 'reminders-only' : 'on';
  } catch {
    return 'reminders-only';
  }
}

/** Stops this account's notifications reaching this phone (used when signing out). */
export async function forgetThisPhone(userId: string) {
  await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
}

/** Registers for notifications once the couple is linked, asking the first time. */
export function useNotificationSetup(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    enableNotifications(userId, true).catch(() => {});
  }, [userId]);
}

/** Opens the right screen when a notification is tapped. */
function useNotificationTapsNative() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const url = last.notification.request.content.data?.url;
    Notifications.clearLastNotificationResponse();
    if (typeof url === 'string' && url.startsWith('/')) router.push(url);
  }, [last]);
}

/** Opens the right screen when a notification is tapped (phones only: the web preview has no notifications). */
export const useNotificationTaps = Platform.OS === 'web' ? () => {} : useNotificationTapsNative;

// ---------------------------------------------------------------------------
// Plan reminders (scheduled on the phone, so they work even offline)
// ---------------------------------------------------------------------------

/** One hour before a plan with a time, or 9 AM on the day for an all-day plan. */
export function reminderTime(plan: Pick<Plan, 'day' | 'time'>): Date {
  const at = parseISODate(plan.day);
  if (plan.time) {
    const [h, m] = plan.time.split(':').map(Number);
    at.setHours(h - 1, m, 0, 0);
  } else {
    at.setHours(9, 0, 0, 0);
  }
  return at;
}

async function scheduleReminders(plans: Plan[]) {
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return;
  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  const soon = Date.now() + 60_000;
  for (const plan of plans) {
    if (!plan.remind) continue;
    const at = reminderTime(plan);
    if (at.getTime() < soon) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: plan.time ? `💕 In an hour: ${plan.title}` : `💕 Today: ${plan.title}`,
        body: [plan.time ? timeLabel(plan.time) : 'All day', plan.note].filter(Boolean).join(' · '),
        sound: SOUND,
        data: { url: `/calendar?day=${plan.day}` },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
}

/** Keeps reminders in step with the calendar: on open, when plans change, and when the app comes back. */
export function useReminders(coupleId: string | undefined) {
  useEffect(() => {
    if (!coupleId || Platform.OS === 'web') return;
    let queue = Promise.resolve();
    const sync = () => {
      queue = queue
        .then(async () => {
          const { data } = await supabase
            .from('events')
            .select('*')
            .eq('couple_id', coupleId)
            .gte('day', toISODate(today()))
            .order('day')
            .limit(60);
          if (data) await scheduleReminders(data as Plan[]);
        })
        .catch(() => {});
    };
    sync();
    const channel = supabase
      .channel(`reminders:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${coupleId}` }, sync)
      .subscribe();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      supabase.removeChannel(channel);
      sub.remove();
    };
  }, [coupleId]);
}
