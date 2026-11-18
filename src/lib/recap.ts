import { addDays, toISODate, today } from '@/lib/dates';
import { friendlyError, supabase } from '@/lib/supabase';

/** What get_recap returns for a month. Counts are for the two of you unless they say me or partner. */
export type Recap = {
  messages_me: number;
  messages_partner: number;
  hearts: number;
  chat_photos: number;
  stickers: number;
  busiest_day: string | null;
  busiest_count: number | null;
  chat_days: number;
  nudges_me: number;
  nudges_partner: number;
  moods_me: { emoji: string; n: number }[];
  moods_partner: { emoji: string; n: number }[];
  answers_both: number;
  checkins_both: number;
  daily_photos: number;
  memories: number;
  memory_photo: string | null;
  memory_caption: string | null;
  dates: number;
  bucket: number;
  challenges: number;
  letters: number;
  live: number;
  games: number;
  tonight: number;
  coupons: number;
  story: number;
  saved: number;
  home_safe: number;
};

export type EmojiCount = { emoji: string; n: number };

/** Worked out on the phone from the words you sent each other. */
export type ChatStats = {
  /** The emoji you both used most, most first. */
  top: EmojiCount[];
  mine: EmojiCount | null;
  theirs: EmojiCount | null;
  /** "I love you", "love u", "nakupenda"… */
  loveYou: number;
  words: number;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10". */
export function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** The first of the month for "2026-10", or null when it isn't a month. */
export function parseMonth(key: string | string[] | undefined): Date | null {
  if (typeof key !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return null;
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

export function shiftMonth(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function thisMonth(t: Date = today()) {
  return new Date(t.getFullYear(), t.getMonth(), 1);
}

/** Last month during the first week of a new one (when the recap notification comes), this month after that. */
export function defaultRecapMonth(t: Date = today()) {
  return t.getDate() <= 7 ? shiftMonth(t, -1) : thisMonth(t);
}

/** The days and the times a month covers. This month only runs until now. */
export function recapBounds(start: Date, now: Date) {
  const end = shiftMonth(start, 1);
  const current = now < end;
  const lastDay = current ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : addDays(end, -1);
  return { from: toISODate(start), to: toISODate(lastDay), since: start.toISOString(), until: (current ? now : end).toISOString(), current };
}

// One emoji: a flag, or a symbol with its skin tone and anything joined to it (👩‍❤️‍👨).
const EMOJI =
  /(?:\uD83C[\uDDE6-\uDDFF]){2}|(?:[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿⭐⭕])️?(?:\uD83C[\uDFFB-\uDFFF])?(?:‍(?:[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿])️?(?:\uD83C[\uDFFB-\uDFFF])?)*/g;
const SKIN_ONLY = /^\uD83C[\uDFFB-\uDFFF]$/;
const LOVE_YOU = /\b(?:love (?:you|u|ya)|luv (?:you|u)|nakupenda|ily)\b/gi;

/** How often each emoji turns up, most first. */
export function emojiCounts(bodies: string[]): EmojiCount[] {
  const counts = new Map<string, EmojiCount>();
  for (const body of bodies) {
    for (const match of body.match(EMOJI) ?? []) {
      if (SKIN_ONLY.test(match)) continue;
      const key = match.replace(/️/g, '');
      const found = counts.get(key);
      if (found) found.n += 1;
      // A lone symbol like ❤ needs its emoji form to show in colour.
      else counts.set(key, { emoji: match.length === 1 ? `${match}️` : match, n: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.emoji.localeCompare(b.emoji));
}

export function chatStats(mine: string[], theirs: string[]): ChatStats {
  const all = [...mine, ...theirs];
  return {
    top: emojiCounts(all).slice(0, 6),
    mine: emojiCounts(mine)[0] ?? null,
    theirs: emojiCounts(theirs)[0] ?? null,
    loveYou: all.reduce((n, b) => n + (b.match(LOVE_YOU)?.length ?? 0), 0),
    words: all.reduce((n, b) => n + b.split(/\s+/).filter((w) => /[a-z0-9\u00C0-\u024F]/i.test(w)).length, 0),
  };
}

const PAGE = 1000;

/** The words you sent each other in a span, a page at a time (up to 10,000 messages). */
async function loadBodies(coupleId: string, userId: string, since: string, until: string, now: Date) {
  const mine: string[] = [];
  const theirs: string[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await supabase
      .from('messages')
      .select('sender_id, body, deliver_at')
      .eq('couple_id', coupleId)
      .is('unsent_at', null)
      .not('body', 'is', null)
      .gte('created_at', since)
      .lt('created_at', until)
      .order('created_at')
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error || !data) break;
    for (const m of data as { sender_id: string; body: string | null; deliver_at: string | null }[]) {
      if (!m.body || (m.deliver_at && new Date(m.deliver_at) > now)) continue;
      (m.sender_id === userId ? mine : theirs).push(m.body);
    }
    if (data.length < PAGE) break;
  }
  return chatStats(mine, theirs);
}

export async function loadRecap(coupleId: string, userId: string, start: Date, now: Date) {
  const b = recapBounds(start, now);
  const [r, chat] = await Promise.all([
    supabase.rpc('get_recap', { p_from: b.from, p_to: b.to, p_since: b.since, p_until: b.until }),
    loadBodies(coupleId, userId, b.since, b.until, now),
  ]);
  return { recap: (r.data as Recap | null) ?? null, chat, current: b.current, error: r.error ? friendlyError(r.error) : '' };
}
