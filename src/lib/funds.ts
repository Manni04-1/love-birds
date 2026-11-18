import { supabase } from '@/lib/supabase';
import type { Fund, FundEntry } from '@/lib/types';

/** "KSh 12,500". */
export const ksh = (n: number) => `KSh ${Math.round(n).toLocaleString('en-GB')}`;

/** Only the digits of what was typed, as a whole number (0 when there are none). */
export const digits = (s: string) => Number(s.replace(/[^0-9]/g, '').slice(0, 9)) || 0;

/** How much each of you has put into one fund. */
export function fundTotals(entries: FundEntry[], fundId: string, userId: string) {
  let mine = 0;
  let theirs = 0;
  for (const e of entries) {
    if (e.fund_id !== fundId) continue;
    if (e.user_id === userId) mine += e.amount;
    else theirs += e.amount;
  }
  return { mine, theirs, total: mine + theirs };
}

export async function loadFunds(coupleId: string) {
  const [f, e] = await Promise.all([
    supabase.from('funds').select('*').eq('couple_id', coupleId).order('created_at'),
    supabase.from('fund_entries').select('id, fund_id, user_id, amount, note, created_at').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(2000),
  ]);
  return { funds: (f.data ?? []) as Fund[], entries: (e.data ?? []) as FundEntry[], error: f.error ?? e.error };
}

/** The fund closest to done that still has some way to go, for a card elsewhere in the app. */
export function topFund(funds: Fund[], entries: FundEntry[], userId: string) {
  const open = funds
    .map((fund) => ({ fund, ...fundTotals(entries, fund.id, userId) }))
    .filter((x) => x.total < x.fund.target)
    .sort((a, b) => b.total / b.fund.target - a.total / a.fund.target || b.fund.created_at.localeCompare(a.fund.created_at));
  return open[0] ?? null;
}
