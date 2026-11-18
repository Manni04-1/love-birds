import { addDays, daysBetween, parseISODate, toISODate } from './dates';

export type SpecialKind = 'anniversary' | 'milestone' | 'birthday' | 'holiday' | 'valentine' | 'story';

export type SpecialDay = {
  /** YYYY-MM-DD */
  day: string;
  kind: SpecialKind;
  emoji: string;
  title: string;
  /** A second line, such as "Long weekend" or "Date set by the moon". */
  note?: string;
  /** Somewhere to go from this day, such as your partner's wishlist on their birthday. */
  link?: string;
  linkLabel?: string;
};

type Who = {
  togetherSince: string | null | undefined;
  myBirthday: string | null | undefined;
  partnerBirthday: string | null | undefined;
  partnerName: string;
  /** Moments from Our story, remembered every year. */
  story?: { title: string; emoji: string | null; happened_on: string; yearly: boolean }[];
};

/** "our first kiss" from "Our first kiss", for the middle of a sentence. */
export function storyPhrase(title: string): string {
  const t = title.trim();
  if (/^[A-Z][a-z]/.test(t) && !/^I\b/.test(t)) return t[0].toLowerCase() + t.slice(1);
  return t;
}

// Easter Sunday (the Anonymous Gregorian algorithm).
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Eid dates follow the moon and are confirmed close to the day, so these are the expected dates.
const EID: Record<number, { fitr: string; adha: string }> = {
  2026: { fitr: '2026-03-20', adha: '2026-05-27' },
  2027: { fitr: '2027-03-10', adha: '2027-05-17' },
  2028: { fitr: '2028-02-27', adha: '2028-05-05' },
  2029: { fitr: '2029-02-15', adha: '2029-04-24' },
  2030: { fitr: '2030-02-05', adha: '2030-04-14' },
};

/** Kenya's public holidays for a year. A holiday on a Sunday moves to the Monday. */
export function kenyanHolidays(year: number): SpecialDay[] {
  const fixed: [string, string][] = [
    ['01-01', "New Year's Day"],
    ['05-01', 'Labour Day'],
    ['06-01', 'Madaraka Day'],
    ['10-10', 'Mazingira Day'],
    ['10-20', 'Mashujaa Day'],
    ['12-12', 'Jamhuri Day'],
    ['12-25', 'Christmas Day'],
    ['12-26', 'Boxing Day'],
  ];
  const list: { date: Date; title: string; note?: string }[] = fixed.map(([md, title]) => ({ date: parseISODate(`${year}-${md}`), title }));
  const e = easter(year);
  list.push({ date: addDays(e, -2), title: 'Good Friday' }, { date: addDays(e, 1), title: 'Easter Monday' });
  const eid = EID[year];
  if (eid) {
    list.push({ date: parseISODate(eid.fitr), title: 'Idd-ul-Fitr', note: 'Expected date, set by the moon' });
    list.push({ date: parseISODate(eid.adha), title: 'Idd-ul-Adha', note: 'Expected date, set by the moon' });
  }
  return list.map(({ date, title, note }) => {
    const dow = date.getDay();
    const long = dow === 5 || dow === 1 ? 'Long weekend' : dow === 0 ? 'Monday is a holiday too, so a long weekend' : undefined;
    return { day: toISODate(date), kind: 'holiday' as const, emoji: '🇰🇪', title, note: [note, long].filter(Boolean).join(' · ') || undefined };
  });
}

function onYear(iso: string, year: number): Date {
  const d = parseISODate(iso);
  const out = new Date(year, d.getMonth(), d.getDate());
  // 29 February birthdays fall on the 28th in other years.
  if (out.getMonth() !== d.getMonth()) return new Date(year, d.getMonth(), 28);
  return out;
}

/** Anniversaries, every hundredth day together, birthdays, Valentine's Day and Kenyan holidays between two dates. */
export function specialDays(from: Date, to: Date, who: Who): SpecialDay[] {
  const out: SpecialDay[] = [];
  const inRange = (d: Date) => d >= from && d <= to;
  for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
    if (who.togetherSince) {
      const since = parseISODate(who.togetherSince);
      const n = year - since.getFullYear();
      const d = onYear(who.togetherSince, year);
      if (n > 0 && inRange(d)) out.push({ day: toISODate(d), kind: 'anniversary', emoji: '💞', title: `${n} ${n === 1 ? 'year' : 'years'} together` });
    }
    if (who.myBirthday) {
      const d = onYear(who.myBirthday, year);
      if (inRange(d)) out.push({ day: toISODate(d), kind: 'birthday', emoji: '🎂', title: 'Your birthday' });
    }
    if (who.partnerBirthday) {
      const d = onYear(who.partnerBirthday, year);
      if (inRange(d))
        out.push({
          day: toISODate(d),
          kind: 'birthday',
          emoji: '🎂',
          title: `${who.partnerName}'s birthday`,
          link: '/wishlist?who=partner',
          linkLabel: `See ${who.partnerName}'s wishlist 🎁`,
        });
    }
    for (const m of who.story ?? []) {
      if (!m.yearly) continue;
      const n = year - parseISODate(m.happened_on).getFullYear();
      const d = onYear(m.happened_on, year);
      if (n > 0 && inRange(d))
        out.push({ day: toISODate(d), kind: 'story', emoji: m.emoji || '💞', title: `${n} ${n === 1 ? 'year' : 'years'} since ${storyPhrase(m.title)}`, link: '/our-story', linkLabel: 'See your story' });
    }
    const valentine = new Date(year, 1, 14);
    if (inRange(valentine)) out.push({ day: toISODate(valentine), kind: 'valentine', emoji: '💘', title: "Valentine's Day" });
    for (const h of kenyanHolidays(year)) if (inRange(parseISODate(h.day))) out.push(h);
  }
  if (who.togetherSince) {
    const since = parseISODate(who.togetherSince);
    const first = Math.max(1, Math.ceil(daysBetween(since, from) / 100));
    const last = Math.floor(daysBetween(since, to) / 100);
    for (let k = first; k <= last; k++) {
      const d = addDays(since, k * 100);
      out.push({ day: toISODate(d), kind: 'milestone', emoji: '✨', title: `${(k * 100).toLocaleString('en-GB')} days together` });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}
