export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

/** YYYY-MM-DD for a moment in the given IANA timezone. */
export function dateInTz(d: Date = new Date(), tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export const todayIso = (tz: string = DEFAULT_TZ) => dateInTz(new Date(), tz);

/** Pure calendar arithmetic on YYYY-MM-DD strings (no timezone drift). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export function ageOn(dob: string, onIso: string): number {
  const [by, bm, bd] = dob.split('-').map(Number);
  const [y, m, d] = onIso.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}

export type RangeKey = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';
export const RANGE_KEYS: RangeKey[] = ['7d', '30d', '3m', '6m', '1y', 'all'];

/** Inclusive start date for a range ending at `end`; null for all time. */
export function rangeStart(range: RangeKey, end: string): string | null {
  switch (range) {
    case '7d': return addDays(end, -6);
    case '30d': return addDays(end, -29);
    case '3m': return addDays(end, -90);
    case '6m': return addDays(end, -182);
    case '1y': return addDays(end, -364);
    default: return null;
  }
}

export function inRange(iso: string, start: string | null, end: string): boolean {
  return (start == null || iso >= start) && iso <= end;
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDate(iso: string, lang: 'vi' | 'en', opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}
