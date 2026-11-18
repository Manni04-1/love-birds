import AsyncStorage from '@react-native-async-storage/async-storage';

import { addDays, toISODate, today } from '@/lib/dates';
import { loadPlans, upcoming } from '@/lib/plans';
import { supabase } from '@/lib/supabase';

/** The widget names in app.json. Keep them: phones refer to placed widgets by these names. */
export const WIDGETS = ['Together', 'Countdown', 'ThinkingOfYou'] as const;
export type WidgetName = (typeof WIDGETS)[number];

/** What the home-screen widgets show. Kept on the phone so they can draw without a connection. */
export type WidgetData = {
  me: string;
  /** Your partner's name, or the pet name you gave them. */
  partner: string;
  myAnimal: string | null;
  partnerAnimal: string | null;
  /** YYYY-MM-DD, or null until you've said when you got together. */
  together: string | null;
  /** Your partner's mood and the day they shared it. */
  mood: { day: string; emoji: string; word: string | null } | null;
  /** The next few times plans come round, soonest first (YYYY-MM-DD, time as HH:MM:SS). */
  plans: { title: string; start: string; end: string; time: string | null }[];
  theme: string;
  /** Private notifications are on, so the widgets leave out words someone else could read. */
  hidden: boolean;
};

/** The last "Thinking of you" sent from a widget, and how it went. */
export type NudgeState = { at: string; ok: boolean } | null;

const DATA = 'widget-data';
const NUDGE = 'widget-nudge';

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown) {
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The widgets just keep what they showed last.
  }
}

/** Gives up on `work` after `ms`, so a widget never hangs on a slow connection. */
export function within<T>(work: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const readWidgetData = () => read<WidgetData>(DATA);
export const writeWidgetData = (data: WidgetData | null) => write(DATA, data);
export const readNudge = () => read<NonNullable<NudgeState>>(NUDGE);
export const writeNudge = (state: NudgeState) => write(NUDGE, state);

/**
 * Looks up everything the widgets show. Null when nobody is signed in or you haven't linked
 * with your partner yet; throws when it can't reach the database, so the old data stays.
 */
export async function fetchWidgetData(): Promise<WidgetData | null> {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return null;
  const { data: me, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (!me?.couple_id) return null;
  const day = toISODate(today());
  const [couple, partner, mood, plans] = await Promise.all([
    supabase.from('couples').select('together_since').eq('id', me.couple_id).maybeSingle(),
    supabase.from('profiles').select('name, animal').eq('couple_id', me.couple_id).neq('id', uid).maybeSingle(),
    supabase.from('moods').select('day, emoji, word').eq('couple_id', me.couple_id).neq('user_id', uid).eq('day', day).maybeSingle(),
    loadPlans(me.couple_id, day, toISODate(addDays(today(), 800))),
  ]);
  const failed = couple.error ?? partner.error ?? mood.error;
  if (failed) throw failed;
  if (!plans) throw new Error('Could not load plans');
  const nickname = (me.partner_nickname as string | null | undefined)?.trim();
  return {
    me: me.name,
    partner: nickname || partner.data?.name || 'your partner',
    myAnimal: me.animal ?? null,
    partnerAnimal: partner.data?.animal ?? null,
    together: couple.data?.together_since ?? null,
    mood: mood.data?.emoji ? { day: mood.data.day, emoji: mood.data.emoji, word: mood.data.word ?? null } : null,
    plans: upcoming(plans, day, 3).map((o) => ({ title: o.plan.title, start: o.start, end: o.end, time: o.plan.time })),
    theme: me.theme ?? 'rose',
    hidden: !!me.private_notifications,
  };
}
