const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export interface DateRange {
  start: Date;
  end: Date;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function makeDate(day: number, monthIndex: number, year: number): Date | null {
  if (day < 1 || day > 31 || monthIndex < 0 || monthIndex > 11) return null;
  const d = new Date(year, monthIndex, day);
  if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) {
    return null;
  }
  return d;
}

function parseMonthToken(token: string): number | null {
  const key = token.trim().toLowerCase().replace(/\./g, "");
  if (key in MONTHS) return MONTHS[key];
  return null;
}

/** e.g. 25 - 29 may 2026, 25-29 May 2026 */
function parseDayMonthYearRange(text: string): DateRange | null {
  const m = text.trim().match(
    /^(\d{1,2})\s*-\s*(\d{1,2})\s+([a-zA-Z.]+)\s+(\d{4})$/i,
  );
  if (!m) return null;
  const month = parseMonthToken(m[3]);
  if (month === null) return null;
  const year = Number(m[4]);
  const start = makeDate(Number(m[1]), month, year);
  const end = makeDate(Number(m[2]), month, year);
  if (!start || !end) return null;
  return { start: startOfDay(start), end: endOfDay(end) };
}

/** e.g. 29 may 2026 */
function parseSingleDayMonthYear(text: string): DateRange | null {
  const m = text.trim().match(/^(\d{1,2})\s+([a-zA-Z.]+)\s+(\d{4})$/i);
  if (!m) return null;
  const month = parseMonthToken(m[2]);
  if (month === null) return null;
  const d = makeDate(Number(m[1]), month, Number(m[3]));
  if (!d) return null;
  return { start: startOfDay(d), end: endOfDay(d) };
}

/** e.g. 29 may (no year) */
function parseSingleDayMonth(text: string, defaultYear: number): DateRange | null {
  const m = text.trim().match(/^(\d{1,2})\s+([a-zA-Z.]+)$/i);
  if (!m) return null;
  const month = parseMonthToken(m[2]);
  if (month === null) return null;
  const d = makeDate(Number(m[1]), month, defaultYear);
  if (!d) return null;
  return { start: startOfDay(d), end: endOfDay(d) };
}

function parseIsoDate(text: string): DateRange | null {
  const m = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = makeDate(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (!d) return null;
  return { start: startOfDay(d), end: endOfDay(d) };
}

function parseSlashDate(text: string): DateRange | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // Prefer d/m/y (common in TH sheets); if invalid, try m/d/y
  let d = makeDate(a, b - 1, year);
  if (!d) d = makeDate(b, a - 1, year);
  if (!d) return null;
  return { start: startOfDay(d), end: endOfDay(d) };
}

export function parseDateRangeFromCell(
  raw: string,
  reference = new Date(),
): DateRange | null {
  const text = raw.trim();
  if (!text) return null;
  const year = reference.getFullYear();

  return (
    parseDayMonthYearRange(text) ??
    parseSingleDayMonthYear(text) ??
    parseSingleDayMonth(text, year) ??
    parseIsoDate(text) ??
    parseSlashDate(text)
  );
}

/** Monday–Friday of the calendar week containing `base`. */
export function workWeekRange(base = new Date()): DateRange {
  const d = startOfDay(base);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return { start: startOfDay(monday), end: endOfDay(friday) };
}

export function nextWorkWeekRange(base = new Date()): DateRange {
  const current = workWeekRange(base);
  const monday = new Date(current.start);
  monday.setDate(monday.getDate() + 7);
  return workWeekRange(monday);
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start.getTime() <= b.end.getTime() && a.end.getTime() >= b.start.getTime();
}

export function isRangeAfterWeek(range: DateRange, week: DateRange): boolean {
  return range.start.getTime() > week.end.getTime();
}

const fmtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
const fmtMonthYear = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
});

export function formatWorkWeekLabel(range: DateRange): string {
  const sameMonth =
    range.start.getMonth() === range.end.getMonth() &&
    range.start.getFullYear() === range.end.getFullYear();
  if (sameMonth) {
    return `${fmtDay.format(range.start)}–${fmtDay.format(range.end)} ${fmtMonthYear.format(range.end)}`;
  }
  return `${fmtDay.format(range.start)} ${fmtMonthYear.format(range.start)} – ${fmtDay.format(range.end)} ${fmtMonthYear.format(range.end)}`;
}
