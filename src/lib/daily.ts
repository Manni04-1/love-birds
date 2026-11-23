import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';

import { addDays, toISODate, today } from './dates';
import { supabase } from './supabase';

/** The heartbeat buzz, the same rhythm as the notification channel. */
export const HEARTBEAT = [0, 110, 130, 110];

export function heartbeat() {
  if (Platform.OS !== 'web') Vibration.vibrate(HEARTBEAT);
}

const todayISO = () => toISODate(today());

/* Mood ------------------------------------------------------------------- */

export type Mood = { user_id: string; day: string; emoji: string; word: string | null; updated_at: string };

/** Today's mood for each of you. Call reload when the screen shows; after that it updates live. */
export function useMoods(coupleId: string | undefined) {
  const [moods, setMoods] = useState<Mood[]>([]);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const { data } = await supabase
      .from('moods')
      .select('user_id, day, emoji, word, updated_at')
      .eq('couple_id', coupleId)
      .eq('day', todayISO());
    setMoods((data ?? []) as Mood[]);
  }, [coupleId]);

  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`moods:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moods', filter: `couple_id=eq.${coupleId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, load]);

  return { moods, reload: load };
}

/** Sets or changes your mood for today. Your partner hears about the first one each day. */
export async function saveMood(coupleId: string, userId: string, emoji: string, word: string | null) {
  const day = todayISO();
  const changes = { emoji, word: word?.trim() || null, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('moods')
    .update(changes)
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .eq('day', day)
    .select('day');
  if (error) throw error;
  if (data?.length) return;
  const { error: err } = await supabase.from('moods').insert({ couple_id: coupleId, day, ...changes });
  if (err) throw err;
}

/* Thinking of you -------------------------------------------------------- */

/**
 * Thinking-of-you taps. Calls onPartnerTap the moment your partner taps while the app is open,
 * and counts how many you've each sent today.
 */
export function useNudges(coupleId: string | undefined, userId: string | undefined, onPartnerTap?: () => void) {
  const [counts, setCounts] = useState({ mine: 0, theirs: 0 });
  const onTap = useRef(onPartnerTap);
  useEffect(() => {
    onTap.current = onPartnerTap;
  }, [onPartnerTap]);

  const load = useCallback(async () => {
    if (!coupleId || !userId) return;
    const { data } = await supabase
      .from('nudges')
      .select('from_user')
      .eq('couple_id', coupleId)
      .gte('created_at', today().toISOString());
    const rows = (data ?? []) as { from_user: string }[];
    const mine = rows.filter((r) => r.from_user === userId).length;
    setCounts({ mine, theirs: rows.length - mine });
  }, [coupleId, userId]);

  useEffect(() => {
    if (!coupleId || !userId) return;
    const channel = supabase
      .channel(`nudges:${coupleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nudges', filter: `couple_id=eq.${coupleId}` }, (payload) => {
        const from = (payload.new as { from_user?: string }).from_user;
        if (from && from !== userId) {
          setCounts((n) => ({ ...n, theirs: n.theirs + 1 }));
          onTap.current?.();
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, userId]);

  const send = useCallback(async () => {
    setCounts((n) => ({ ...n, mine: n.mine + 1 }));
    const { error } = await supabase.rpc('send_nudge');
    if (error) {
      setCounts((n) => ({ ...n, mine: Math.max(0, n.mine - 1) }));
      throw error;
    }
  }, []);

  return { ...counts, send, reload: load };
}

/* Rose, thorn and bud ---------------------------------------------------- */

export type Checkin = { day: string; user_id: string; rose: string | null; thorn: string | null; bud: string | null; created_at: string };
export type CheckinDay = { day: string; mine: Checkin | null; partner: Checkin | null };

/** Today's check-ins and the last few days. Your partner's stay hidden until you've shared yours. */
export function useCheckins(userId: string | undefined, pastDays = 0) {
  const [days, setDays] = useState<CheckinDay[] | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const t = today();
    const { data, error } = await supabase.rpc('get_checkins', { p_from: toISODate(addDays(t, -pastDays)), p_to: toISODate(t) });
    if (error) return setDays([]);
    const rows = (data ?? []) as Checkin[];
    const out: CheckinDay[] = [];
    for (let i = 0; i <= pastDays; i++) {
      const day = toISODate(addDays(t, -i));
      const mine = rows.find((r) => r.day === day && r.user_id === userId) ?? null;
      const partner = rows.find((r) => r.day === day && r.user_id !== userId) ?? null;
      if (i === 0 || mine || partner) out.push({ day, mine, partner });
    }
    setDays(out);
  }, [userId, pastDays]);

  return { today: days?.[0] ?? null, past: days?.slice(1) ?? [], loaded: days !== null, reload: load };
}

export async function saveCheckin(coupleId: string, rose: string, thorn: string, bud: string) {
  const { error } = await supabase.from('checkins').insert({
    couple_id: coupleId,
    day: todayISO(),
    rose: rose.trim(),
    thorn: thorn.trim() || null,
    bud: bud.trim() || null,
  });
  if (error) throw error;
}

/* Photo of the day ------------------------------------------------------- */

export type DailyPhoto = {
  day: string;
  user_id: string;
  photo_path: string | null;
  caption: string | null;
  created_at: string;
  /** When the other person liked this photo. Missing until photo-likes.sql has run. */
  liked_at?: string | null;
};
export type PhotoDay = { day: string; mine: DailyPhoto | null; partner: DailyPhoto | null };

/** Today's photos and the last few days. Your partner's stays hidden until you've added yours. */
export function useDailyPhotos(userId: string | undefined, pastDays = 0) {
  const [days, setDays] = useState<PhotoDay[] | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const t = today();
    const { data, error } = await supabase.rpc('get_daily_photos', { p_from: toISODate(addDays(t, -pastDays)), p_to: toISODate(t) });
    if (error) return setDays([]);
    const rows = (data ?? []) as DailyPhoto[];
    const out: PhotoDay[] = [];
    for (let i = 0; i <= pastDays; i++) {
      const day = toISODate(addDays(t, -i));
      const mine = rows.find((r) => r.day === day && r.user_id === userId) ?? null;
      const partner = rows.find((r) => r.day === day && r.user_id !== userId) ?? null;
      if (i === 0 || mine || partner) out.push({ day, mine, partner });
    }
    setDays(out);
  }, [userId, pastDays]);

  return { today: days?.[0] ?? null, past: days?.slice(1) ?? [], loaded: days !== null, reload: load };
}

/** Adds today's photo, or swaps it if you've already added one. */
export async function saveDailyPhoto(coupleId: string, userId: string, photoPath: string, caption: string) {
  const day = todayISO();
  const changes = { photo_path: photoPath, caption: caption.trim() || null };
  const { data, error } = await supabase
    .from('daily_photos')
    .update(changes)
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .eq('day', day)
    .select('day');
  if (error) throw error;
  if (data?.length) return;
  const { error: err } = await supabase.from('daily_photos').insert({ couple_id: coupleId, day, ...changes });
  if (err) throw err;
}

/** Likes or unlikes your partner's photo for a day. The first like notifies them. */
export async function likeDailyPhoto(day: string, like: boolean) {
  const { error } = await supabase.rpc('like_daily_photo', { p_day: day, p_like: like });
  if (error) throw error;
}

/* Today's sweet gesture -------------------------------------------------- */

/** Whether you've ticked off today's gesture. Kept on this phone only. */
export function useGestureDone() {
  const key = `gesture-done:${todayISO()}`;
  const [done, setDone] = useState<{ key: string; value: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key)
      .then((v) => active && setDone({ key, value: v === '1' }))
      .catch(() => active && setDone({ key, value: false }));
    return () => {
      active = false;
    };
  }, [key]);

  const toggle = useCallback(() => {
    const next = !(done?.key === key && done.value);
    setDone({ key, value: next });
    (next ? AsyncStorage.setItem(key, '1') : AsyncStorage.removeItem(key)).catch(() => {});
  }, [done, key]);

  return { done: done?.key === key && done.value, toggle };
}
