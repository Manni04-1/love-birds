const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "Friday" or "Tue 24 Nov". */
export function dayLabel(iso: string): string {
  const d = parseISODate(iso);
  const diff = daysBetween(today(), d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function longDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** "20:00:00" -> "8:00 PM". Null means all day. */
export function timeLabel(t: string | null): string {
  if (!t) return 'All day';
  const [hRaw, m] = t.split(':').map(Number);
  const suffix = hRaw >= 12 ? 'PM' : 'AM';
  const h = hRaw % 12 || 12;
  return `${h}:${pad(m)} ${suffix}`;
}

export function toTimeString(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function clockLabel(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return timeLabel(`${d.getHours()}:${d.getMinutes()}`);
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The same number for everyone on a given calendar day, used to pick the daily question. */
export function dayNumber(d: Date = today()): number {
  return daysBetween(new Date(2024, 0, 1), d);
}
