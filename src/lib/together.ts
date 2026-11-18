import { CHALLENGES, weekOf, type Challenge } from '@/content/challenges';

import { addDays, daysBetween, toISODate, today } from './dates';
import { hashRank } from './games';
import { supabase } from './supabase';
import type { BucketItem } from './types';

/* Weekly challenge ------------------------------------------------------- */

const FIRST_MONDAY = new Date(2024, 0, 1);

/**
 * This week's challenge for the two of you. Every couple goes through the
 * whole list in their own order, so nothing repeats for 40 weeks.
 */
export function challengeFor(coupleId: string, monday: Date): Challenge {
  const order = [...CHALLENGES].sort((a, b) => hashRank(coupleId, a.key) - hashRank(coupleId, b.key));
  const n = Math.round(daysBetween(FIRST_MONDAY, monday) / 7);
  return order[((n % order.length) + order.length) % order.length];
}

export function challengeByKey(key: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.key === key);
}

export type ChallengeTick = { week: string; user_id: string; challenge_key: string; created_at: string };

/** One week's challenge, and who has ticked it off. */
export type ChallengeWeek = { week: string; challenge: Challenge; mine: boolean; partner: boolean };

/** A week you both ticked off. */
export type Badge = { week: string; challenge: Challenge };

export async function loadChallengeTicks(coupleId: string): Promise<ChallengeTick[]> {
  const { data } = await supabase.from('challenge_done').select('week, user_id, challenge_key, created_at').eq('couple_id', coupleId).order('week', { ascending: false });
  return (data ?? []) as ChallengeTick[];
}

/** This week, last week and your badges, worked out from every tick. */
export function challengeSummary(ticks: ChallengeTick[], coupleId: string, userId: string, now: Date = today()) {
  const monday = weekOf(now);
  const weekFor = (d: Date): ChallengeWeek => {
    const iso = toISODate(d);
    const here = ticks.filter((t) => t.week === iso);
    const saved = here[0] ? challengeByKey(here[0].challenge_key) : undefined;
    return {
      week: iso,
      challenge: saved ?? challengeFor(coupleId, d),
      mine: here.some((t) => t.user_id === userId),
      partner: here.some((t) => t.user_id !== userId),
    };
  };
  const byWeek = new Map<string, ChallengeTick[]>();
  for (const t of ticks) byWeek.set(t.week, [...(byWeek.get(t.week) ?? []), t]);
  const badges: Badge[] = [];
  for (const [week, list] of byWeek) {
    if (new Set(list.map((t) => t.user_id)).size < 2) continue;
    const challenge = challengeByKey(list[0].challenge_key);
    if (challenge) badges.push({ week, challenge });
  }
  badges.sort((a, b) => b.week.localeCompare(a.week));
  const lastMonday = addDays(monday, -7);
  return {
    thisWeek: weekFor(monday),
    lastWeek: weekFor(lastMonday),
    /** You can still tick off last week's challenge on Monday and Tuesday. */
    lastWeekOpen: daysBetween(lastMonday, now) <= 8,
    daysLeft: daysBetween(now, addDays(monday, 6)),
    badges,
  };
}

export async function tickChallenge(coupleId: string, week: ChallengeWeek) {
  return supabase.from('challenge_done').insert({ couple_id: coupleId, week: week.week, challenge_key: week.challenge.key });
}

export async function untickChallenge(coupleId: string, userId: string, week: string) {
  return supabase.from('challenge_done').delete().eq('couple_id', coupleId).eq('user_id', userId).eq('week', week);
}

/* Bucket list ------------------------------------------------------------ */

export async function loadBucket(coupleId: string): Promise<BucketItem[]> {
  const { data } = await supabase.from('bucket_items').select('*').eq('couple_id', coupleId).order('created_at', { ascending: true });
  return (data ?? []) as BucketItem[];
}
