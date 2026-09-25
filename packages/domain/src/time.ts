import { plural } from "./plural";

/** Company time zone (Khujand, Tajikistan). Fixed UTC+5, no DST. */
export const TIME_ZONE = "Asia/Dushanbe";
export const TZ_OFFSET = "+05:00";

/** Parse "HH:MM" or "HH:MM:SS" into minutes since midnight. */
export function parseTimeToMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
  if (!m) throw new Error(`Invalid time: ${t}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${t}`);
  return h * 60 + min;
}

/** Format minutes since midnight as "HH:MM". Values >= 1440 wrap around. */
export function formatMinutes(total: number): string {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM:SS" → "HH:MM" */
export function shortTime(t: string): string {
  return t.slice(0, 5);
}

/** Absolute instant for a local (company time zone) date + minutes since midnight. */
export function localDateTime(date: string, minutesSinceMidnight: number): Date {
  const base = new Date(`${date}T00:00:00${TZ_OFFSET}`);
  return new Date(base.getTime() + minutesSinceMidnight * 60_000);
}

/** ISO weekday (1..7) of a YYYY-MM-DD date string, independent of host time zone. */
export function weekdayOfDate(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Add days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface LocalNow {
  date: string; // YYYY-MM-DD in company time zone
  minutes: number; // minutes since local midnight
  weekday: number; // ISO 1..7
  instant: Date;
}

/** Current local date/time in the company time zone. */
export function localNow(instant: Date = new Date()): LocalNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour")) % 24;
  const minutes = hour * 60 + Number(get("minute"));
  return { date, minutes, weekday: weekdayOfDate(date), instant };
}

/** Format an instant as "HH:MM" in the company time zone. */
export function formatLocalTime(instant: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(instant);
}

/** Format a YYYY-MM-DD as "21 сентября" (ru). */
export function formatLocalDate(date: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", ...opts }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * A span of minutes the way an administrator says it out loud:
 * "12 минут", "1 ч 15 мин", "4 ч". Used for "how long ago" and "how late".
 */
export function durationLabel(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  if (m < 60) return `${m} ${plural(m, ["минута", "минуты", "минут"])}`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}
