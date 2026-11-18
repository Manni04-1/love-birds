import { addDays, daysBetween, parseISODate, shortDate, toISODate } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import type { Plan } from '@/lib/types';

export type Repeat = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly';

export const REPEATS: { key: Repeat; label: string }[] = [
  { key: 'daily', label: 'Every day' },
  { key: 'weekly', label: 'Every week' },
  { key: 'fortnightly', label: 'Every 2 weeks' },
  { key: 'monthly', label: 'Every month' },
  { key: 'yearly', label: 'Every year' },
];

export const isRepeat = (v: unknown): v is Repeat => REPEATS.some((r) => r.key === v);

/** One time a plan happens: the day it starts and the day it ends (the same day for most plans). */
export type Occurrence = { plan: Plan; start: string; end: string };

/** How many days after the first a plan runs on for: 0 for a one-day plan. */
export function span(plan: Pick<Plan, 'day' | 'end_day'>): number {
  return plan.end_day && plan.end_day > plan.day ? daysBetween(parseISODate(plan.day), parseISODate(plan.end_day)) : 0;
}

/** The most days after the first a repeating plan can run on for, so one time ends before the next begins. */
export function longestSpan(repeat: Repeat | null): number {
  switch (repeat) {
    case 'daily':
      return 0;
    case 'weekly':
      return 6;
    case 'fortnightly':
      return 13;
    case 'monthly':
      return 27;
    case 'yearly':
      return 364;
    default:
      return 366;
  }
}

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/**
 * The nth time a repeating plan comes round, counting the first as 0. Monthly and yearly plans
 * on a day a shorter month doesn't have (the 31st, or 29 February) fall on that month's last day.
 */
function nth(first: Date, repeat: Repeat, n: number): Date {
  if (repeat === 'daily') return addDays(first, n);
  if (repeat === 'weekly') return addDays(first, 7 * n);
  if (repeat === 'fortnightly') return addDays(first, 14 * n);
  const months = repeat === 'monthly' ? n : 12 * n;
  const total = first.getMonth() + months;
  const y = first.getFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return new Date(y, m, Math.min(first.getDate(), daysInMonth(y, m)));
}

/** Where to start counting, so a plan that began years ago doesn't step through every time since. Never too far. */
function startNear(first: Date, repeat: Repeat, from: Date, length: number): number {
  const days = daysBetween(first, from) - length;
  if (days <= 0) return 0;
  if (repeat === 'daily') return days;
  if (repeat === 'weekly') return Math.floor(days / 7);
  if (repeat === 'fortnightly') return Math.floor(days / 14);
  if (repeat === 'monthly') return Math.max(0, Math.floor(days / 31) - 1);
  return Math.max(0, Math.floor(days / 366) - 1);
}

/** Every time a plan happens that touches the days from `from` to `to` (YYYY-MM-DD, both included). */
export function occurrences(plan: Plan, from: string, to: string, limit = 400): Occurrence[] {
  const length = span(plan);
  const first = parseISODate(plan.day);
  const repeat = isRepeat(plan.repeats) ? plan.repeats : null;
  if (!repeat) {
    const end = toISODate(addDays(first, length));
    return plan.day <= to && end >= from ? [{ plan, start: plan.day, end }] : [];
  }
  const skipped = new Set(plan.skip_days ?? []);
  const out: Occurrence[] = [];
  for (let n = startNear(first, repeat, parseISODate(from), length), steps = 0; out.length < limit && steps < 5000; n++, steps++) {
    const at = nth(first, repeat, n);
    const start = toISODate(at);
    if (start > to || (plan.repeat_until && start > plan.repeat_until)) break;
    const end = toISODate(addDays(at, length));
    if (end < from || skipped.has(start)) continue;
    out.push({ plan, start, end });
  }
  return out;
}

const byStart = (a: Occurrence, b: Occurrence) =>
  a.start.localeCompare(b.start) || (a.plan.time ?? '').localeCompare(b.plan.time ?? '') || a.plan.title.localeCompare(b.plan.title);

/** All the times plans happen between two days, soonest first. */
export function occurrencesBetween(plans: Plan[], from: string, to: string): Occurrence[] {
  return plans.flatMap((p) => occurrences(p, from, to)).sort(byStart);
}

/** Each day between `from` and `to` with the plans on it, including every day of a plan that lasts several. */
export function plansByDay(plans: Plan[], from: string, to: string): Map<string, Occurrence[]> {
  const days = new Map<string, Occurrence[]>();
  for (const o of occurrencesBetween(plans, from, to)) {
    const last = o.end > to ? to : o.end;
    for (let d = parseISODate(o.start < from ? from : o.start); toISODate(d) <= last; d = addDays(d, 1)) {
      const key = toISODate(d);
      const list = days.get(key);
      if (list) list.push(o);
      else days.set(key, [o]);
    }
  }
  return days;
}

/** The next time each plan happens from `from` on (one still going on counts), soonest first. */
export function upcoming(plans: Plan[], from: string, count: number): Occurrence[] {
  const far = toISODate(addDays(parseISODate(from), 800));
  return plans
    .map((p) => occurrences(p, from, far, 1)[0])
    .filter((o): o is Occurrence => !!o)
    .sort(byStart)
    .slice(0, count);
}

/**
 * Plans that might fall between two days: those starting in that time, running into it, or repeating.
 * Null when they couldn't be loaded, for example with no signal.
 */
export async function loadPlans(coupleId: string, from: string, to: string): Promise<Plan[] | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('couple_id', coupleId)
    .lte('day', to)
    .or(`day.gte.${from},end_day.gte.${from},repeats.not.is.null`)
    .order('day')
    .limit(500);
  if (!error) return (data ?? []) as Plan[];
  // Before calendar.sql has run there are no plans over several days or repeats to find.
  const old = await supabase.from('events').select('*').eq('couple_id', coupleId).gte('day', from).lte('day', to).order('day').limit(500);
  return old.error ? null : ((old.data ?? []) as Plan[]);
}

/** The next few plans from a day on, each once even if it repeats. */
export async function loadUpcoming(coupleId: string, from: string, count: number): Promise<Occurrence[]> {
  const to = toISODate(addDays(parseISODate(from), 800));
  return upcoming((await loadPlans(coupleId, from, to)) ?? [], from, count);
}

/** "Every week", or "Every week until 20 Dec 2026". */
export function repeatLabel(plan: Pick<Plan, 'repeats' | 'repeat_until'>): string {
  const r = REPEATS.find((x) => x.key === plan.repeats);
  if (!r) return '';
  return plan.repeat_until ? `${r.label} until ${shortDate(plan.repeat_until)}` : r.label;
}

/** "Fri 21 Nov". */
export function shortDay(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Fri 21 Nov to Sun 23 Nov". */
export function rangeLabel(o: Pick<Occurrence, 'start' | 'end'>): string {
  return `${shortDay(o.start)} to ${shortDay(o.end)}`;
}

/** Which day of a plan that lasts several days this is: "Day 2 of 3". */
export function dayOf(o: Pick<Occurrence, 'start' | 'end'>, day: string): string {
  const total = daysBetween(parseISODate(o.start), parseISODate(o.end)) + 1;
  return `Day ${daysBetween(parseISODate(o.start), parseISODate(day)) + 1} of ${total}`;
}
