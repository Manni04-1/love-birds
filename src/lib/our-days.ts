import type { Checkin, DailyPhoto, Mood } from './daily';
import { supabase } from './supabase';
import type { Answer, Memory } from './types';

/** Everything the two of you shared on one day: moods, check-ins, photos, the daily question and memories. */
export type DayMoments = {
  moods: { mine: Mood | null; partner: Mood | null };
  checkins: { mine: Checkin | null; partner: Checkin | null };
  photos: { mine: DailyPhoto | null; partner: DailyPhoto | null };
  answers: { mine: Answer | null; partner: Answer | null };
  memories: Memory[];
};

const empty = (): DayMoments => ({
  moods: { mine: null, partner: null },
  checkins: { mine: null, partner: null },
  photos: { mine: null, partner: null },
  answers: { mine: null, partner: null },
  memories: [],
});

/** True when there's anything to show for the day. */
export function hasMoments(m: DayMoments | undefined): boolean {
  if (!m) return false;
  return !!(m.moods.mine || m.moods.partner || m.checkins.mine || m.checkins.partner || m.photos.mine || m.photos.partner || m.answers.mine || m.answers.partner || m.memories.length);
}

/** Your shared moments between two dates (YYYY-MM-DD), by day. Your partner's words stay hidden where the app hides them elsewhere. */
export async function loadMoments(coupleId: string, userId: string, from: string, to: string): Promise<Map<string, DayMoments>> {
  const [moods, checkins, photos, answers, memories] = await Promise.all([
    supabase.from('moods').select('user_id, day, emoji, word, updated_at').eq('couple_id', coupleId).gte('day', from).lte('day', to),
    supabase.rpc('get_checkins', { p_from: from, p_to: to }),
    supabase.rpc('get_daily_photos', { p_from: from, p_to: to }),
    supabase.rpc('get_answers', { p_from: from, p_to: to }),
    supabase.from('memories').select('*').eq('couple_id', coupleId).gte('happened_on', from).lte('happened_on', to),
  ]);
  const out = new Map<string, DayMoments>();
  const at = (day: string) => {
    let d = out.get(day);
    if (!d) {
      d = empty();
      out.set(day, d);
    }
    return d;
  };
  const side = (uid: string) => (uid === userId ? 'mine' : 'partner');
  for (const m of (moods.data ?? []) as Mood[]) at(m.day).moods[side(m.user_id)] = m;
  for (const c of (checkins.data ?? []) as Checkin[]) at(c.day).checkins[side(c.user_id)] = c;
  for (const p of (photos.data ?? []) as DailyPhoto[]) at(p.day).photos[side(p.user_id)] = p;
  for (const a of (answers.data ?? []) as Answer[]) at(a.day).answers[side(a.user_id)] = a;
  for (const m of (memories.data ?? []) as Memory[]) at(m.happened_on).memories.push(m);
  return out;
}

export type FreeDay = { user_id: string; day: string };

export async function loadFreeDays(coupleId: string, from: string, to: string): Promise<FreeDay[]> {
  const { data } = await supabase.from('free_days').select('user_id, day').eq('couple_id', coupleId).gte('day', from).lte('day', to);
  return (data ?? []) as FreeDay[];
}

export async function setFree(coupleId: string, userId: string, day: string, free: boolean) {
  if (free) {
    const { error } = await supabase.from('free_days').insert({ couple_id: coupleId, day });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase.from('free_days').delete().eq('couple_id', coupleId).eq('user_id', userId).eq('day', day);
    if (error) throw error;
  }
}

export type IdeaPick = { id: string; title: string; details: string | null; matched: boolean };

/** A date idea for an evening you're both free: one you both liked if there is one, otherwise one from the deck. */
export async function ideaFor(coupleId: string, day: string, rank: (seed: string, id: string) => number): Promise<IdeaPick | null> {
  const { data: matches } = await supabase
    .from('date_matches')
    .select('idea_id, date_ideas(id, title, details)')
    .eq('couple_id', coupleId)
    .is('event_id', null)
    .is('done_on', null)
    .limit(30);
  const liked = ((matches ?? []) as unknown as { idea_id: string; date_ideas: { id: string; title: string; details: string | null } | null }[]).filter((m) => m.date_ideas);
  if (liked.length) {
    const pick = [...liked].sort((a, b) => rank(day, a.idea_id) - rank(day, b.idea_id))[0];
    return { id: pick.idea_id, title: pick.date_ideas!.title, details: pick.date_ideas!.details, matched: true };
  }
  const { data: ideas } = await supabase.from('date_ideas').select('id, title, details').is('couple_id', null).limit(200);
  const list = (ideas ?? []) as { id: string; title: string; details: string | null }[];
  if (!list.length) return null;
  const pick = [...list].sort((a, b) => rank(day, a.id) - rank(day, b.id))[0];
  return { ...pick, matched: false };
}
