import { toISODate, today } from './dates';
import { supabase } from './supabase';

/** Counts from get_garden: everything you've done together since you linked. */
export type GardenCounts = {
  moods: number;
  nudge_days: number;
  checkins: number;
  photos: number;
  answers: number;
  games: number;
  memories: number;
  dates: number;
  challenges: number;
  bucket: number;
  letters: number;
  live: number;
  chat_days: number;
  /** The rest arrive with extras.sql, so they can be missing until it has run. */
  tonight?: number;
  coupons?: number;
  story?: number;
  wishes?: number;
  saved?: number;
  /** You've done something today. */
  today_me: boolean;
  /** Your partner has done something today. */
  today_partner: boolean;
};

type CountKey = Exclude<keyof GardenCounts, 'today_me' | 'today_partner'>;

/** How much each thing helps the garden grow, and how to say it. */
export const GROWS: { key: CountKey; points: number; label: string }[] = [
  { key: 'dates', points: 10, label: 'dates you went on' },
  { key: 'bucket', points: 10, label: 'bucket list dreams ticked off' },
  { key: 'challenges', points: 8, label: 'weekly challenges done together' },
  { key: 'memories', points: 3, label: 'memories saved' },
  { key: 'letters', points: 3, label: 'open-when letters' },
  { key: 'coupons', points: 3, label: 'love coupons made happen' },
  { key: 'wishes', points: 3, label: 'wishes granted' },
  { key: 'tonight', points: 2, label: 'evenings decided together' },
  { key: 'story', points: 2, label: 'moments added to your story' },
  { key: 'checkins', points: 2, label: 'evening check-ins' },
  { key: 'photos', points: 2, label: 'photos of the day' },
  { key: 'answers', points: 2, label: 'daily questions answered' },
  { key: 'moods', points: 1, label: 'moods shared' },
  { key: 'nudge_days', points: 1, label: 'days you sent a nudge' },
  { key: 'games', points: 1, label: 'game answers' },
  { key: 'live', points: 1, label: 'live rounds played' },
  { key: 'chat_days', points: 1, label: 'days you both chatted' },
  { key: 'saved', points: 1, label: 'savings added to a fund' },
];

export const STAGES: { min: number; name: string }[] = [
  { min: 0, name: 'Seed' },
  { min: 15, name: 'Sprout' },
  { min: 50, name: 'Seedling' },
  { min: 120, name: 'Young plant' },
  { min: 250, name: 'Budding' },
  { min: 450, name: 'First flowers' },
  { min: 750, name: 'In full bloom' },
  { min: 1200, name: 'Flourishing' },
  { min: 2000, name: 'Magnificent' },
];

export function gardenPoints(c: GardenCounts): number {
  return GROWS.reduce((sum, g) => sum + (Number(c[g.key]) || 0) * g.points, 0);
}

/** Which stage the garden is at, and how far it is to the next one (0 to 1). */
export function gardenStage(points: number) {
  let index = 0;
  for (let i = 0; i < STAGES.length; i++) if (points >= STAGES[i].min) index = i;
  const stage = STAGES[index];
  const next = STAGES[index + 1] ?? null;
  const progress = next ? (points - stage.min) / (next.min - stage.min) : 1;
  return { index, name: stage.name, next, progress: Math.max(0, Math.min(1, progress)), toNext: next ? next.min - points : 0 };
}

/** The three things that have grown your garden the most. */
export function topGrowers(c: GardenCounts) {
  return GROWS.map((g) => ({ ...g, count: Number(c[g.key]) || 0, total: (Number(c[g.key]) || 0) * g.points }))
    .filter((g) => g.count > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
}

export async function loadGarden(): Promise<GardenCounts | null> {
  const start = today();
  const { data, error } = await supabase.rpc('get_garden', { p_day: toISODate(start), p_since: start.toISOString() });
  if (error || !data) return null;
  return data as GardenCounts;
}
