import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { addDays, parseISODate, timeLabel, toISODate, today } from './dates';
import { whileAway } from './lock';
import { supabase } from './supabase';
import type { SpecialDay } from './special-days';
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
  if (perm.status !== 'granted' && ask && perm.canAskAgain) perm = await whileAway(() => Notifications.requestPermissionsAsync());
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

const EVENING = 'evening-';

async function cancelScheduled(match: (identifier: string) => boolean) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter((n) => match(n.identifier)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

const SPECIAL_BODY: Record<SpecialDay['kind'], string> = {
  anniversary: 'Happy anniversary, you two 💞',
  birthday: 'A day to make extra special 🎉',
  milestone: 'Another hundred days of you two. Celebrate a little today.',
  valentine: 'Happy Valentine\'s Day, love birds 💘',
  holiday: '',
  story: 'A little anniversary of your story. Remember it together today 💞',
};

async function scheduleReminders(plans: Plan[], specials: SpecialDay[]) {
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return;
  await ensureChannel();
  await cancelScheduled((id) => !id.startsWith(EVENING));
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
  // Anniversaries, birthdays and milestones: 8 AM on the day.
  for (const s of specials) {
    if (s.kind === 'holiday') continue;
    const at = parseISODate(s.day);
    at.setHours(8, 0, 0, 0);
    if (at.getTime() < soon) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: `${s.emoji} ${s.title}`, body: SPECIAL_BODY[s.kind], sound: SOUND, data: { url: `/calendar?day=${s.day}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
}

/** Keeps reminders in step with the calendar: on open, when plans change, and when the app comes back. */
export function useReminders(coupleId: string | undefined, specials: SpecialDay[] = []) {
  // Compared by content, so a new but identical list doesn't reschedule everything.
  const specialsKey = JSON.stringify(specials);
  useEffect(() => {
    const special = JSON.parse(specialsKey) as SpecialDay[];
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
          if (data) await scheduleReminders(data as Plan[], special);
        })
        .catch(() => {});
    };
    const evening = () => {
      queue = queue.then(() => scheduleEvening(coupleId)).catch(() => {});
    };
    sync();
    evening();
    const channel = supabase
      .channel(`reminders:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${coupleId}` }, sync)
      .subscribe();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sync();
        evening();
      }
    });
    return () => {
      supabase.removeChannel(channel);
      sub.remove();
    };
  }, [coupleId, specialsKey]);
}

// ---------------------------------------------------------------------------
// The evening moment: 8 PM, a nudge to share your rose, thorn and bud and
// your photo of the day. Scheduled a week ahead, and skipped for today once
// you've checked in.
// ---------------------------------------------------------------------------

const EVENING_SETTING = 'evening-reminder';

export async function eveningReminderOn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(EVENING_SETTING)) !== 'off';
  } catch {
    return true;
  }
}

async function scheduleEvening(coupleId: string) {
  if (Platform.OS === 'web') return;
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return;
  await ensureChannel();
  await cancelScheduled((id) => id.startsWith(EVENING));
  if (!(await eveningReminderOn())) return;

  const t = today();
  const { data } = await supabase.from('checkins').select('day').eq('couple_id', coupleId).eq('day', toISODate(t));
  const doneToday = !!data?.length;
  const soon = Date.now() + 60_000;
  for (let i = 0; i < 7; i++) {
    if (i === 0 && doneToday) continue;
    const at = addDays(t, i);
    at.setHours(20, 0, 0, 0);
    if (at.getTime() < soon) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${EVENING}${toISODate(at)}`,
      content: {
        title: '🌹 Your evening moment',
        body: 'Share a rose, a thorn and a bud, and your photo of the day.',
        sound: SOUND,
        data: { url: '/checkin' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
}

/** Reschedules the 8 PM reminder, for example after you check in or switch it off. */
export async function refreshEveningReminder(coupleId: string) {
  await scheduleEvening(coupleId).catch(() => {});
}

export async function setEveningReminder(coupleId: string, on: boolean) {
  await AsyncStorage.setItem(EVENING_SETTING, on ? 'on' : 'off').catch(() => {});
  await refreshEveningReminder(coupleId);
}
