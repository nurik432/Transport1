import { weekdayOfDate } from "./time";

/**
 * Work schedules for the driver timesheet. A schedule says only whether a date
 * is a working day; the scan windows stay global. A schedule changes through
 * versions dated `effectiveFrom`; a driver is put on a schedule from a date,
 * and a driver with no assignment falls back to the default schedule.
 * `buildWorkCalendar` is the one place that answers "is this a working day".
 */

export type WorkScheduleKind = "weekly" | "cycle";

export type WorkPattern =
  /** ISO weekdays 1 (Mon) … 7 (Sun) that are working days */
  | { kind: "weekly"; weekdays: number[] }
  /** `workDays` on, then `restDays` off, repeating from the cycle start */
  | { kind: "cycle"; workDays: number; restDays: number };

export interface ScheduleVersion {
  /** YYYY-MM-DD */
  effectiveFrom: string;
  pattern: WorkPattern;
  /** holidays from the timesheet settings are days off */
  holidaysOff: boolean;
}

export interface ScheduleAssignment {
  scheduleId: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  /** first working day of the cycle; null = the assignment date. Unused for weekly. */
  cycleStart: string | null;
}

/** Used only when the database has no default schedule at all. */
export const FALLBACK_VERSION: ScheduleVersion = {
  effectiveFrom: "2000-01-01",
  pattern: { kind: "weekly", weekdays: [1, 2, 3, 4, 5] },
  holidaysOff: true,
};

export const MAX_CYCLE_DAYS = 31;

export const WORK_SCHEDULE_KIND_LABEL: Record<WorkScheduleKind, string> = {
  weekly: "Недельный",
  cycle: "Сменный",
};

const WEEKDAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

/** Why a pattern cannot be saved, or null when it can. */
export function validatePattern(p: WorkPattern): string | null {
  if (p.kind === "weekly") {
    if (p.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return "Дни недели указываются числами от 1 до 7";
    if (new Set(p.weekdays).size === 0) return "Отметьте хотя бы один рабочий день";
    return null;
  }
  if (!Number.isInteger(p.workDays) || p.workDays < 1) return "Рабочих дней в цикле должно быть не меньше одного";
  if (!Number.isInteger(p.restDays) || p.restDays < 0) return "Выходных дней в цикле не может быть меньше нуля";
  if (p.workDays + p.restDays > MAX_CYCLE_DAYS) return `Цикл не может быть длиннее ${MAX_CYCLE_DAYS} дней`;
  return null;
}

/** Sorted unique weekdays, so equal patterns compare equal. */
export function normalizePattern(p: WorkPattern): WorkPattern {
  return p.kind === "weekly" ? { kind: "weekly", weekdays: [...new Set(p.weekdays)].sort((a, b) => a - b) } : { ...p };
}

/** "пн–пт", "пн, ср, пт", "2/2" */
export function patternLabel(p: WorkPattern): string {
  if (p.kind === "cycle") return `${p.workDays}/${p.restDays}`;
  const days = [...new Set(p.weekdays)].sort((a, b) => a - b);
  if (days.length === 7) return "ежедневно";
  const contiguous = days.length >= 3 && days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
  if (contiguous) return `${WEEKDAY_SHORT[days[0]! - 1]}–${WEEKDAY_SHORT[days.at(-1)! - 1]}`;
  return days.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The row in force on `date`: the latest with `effectiveFrom <= date`, or null. */
export function rowAt<T extends { effectiveFrom: string }>(rows: readonly T[], date: string): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.effectiveFrom <= date && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  }
  return best;
}

/**
 * The version of a schedule in force on `date`. Before its first version a
 * schedule behaves like that first version, so a schedule created today can be
 * assigned from a past date.
 */
export function versionAt(versions: readonly ScheduleVersion[], date: string): ScheduleVersion | null {
  const found = rowAt(versions, date);
  if (found) return found;
  return versions.reduce<ScheduleVersion | null>((a, v) => (!a || v.effectiveFrom < a.effectiveFrom ? v : a), null);
}

/** Does the pattern alone make `date` a working day? */
export function isPatternWorkDay(date: string, pattern: WorkPattern, cycleStart: string): boolean {
  if (pattern.kind === "weekly") return pattern.weekdays.includes(weekdayOfDate(date));
  const length = pattern.workDays + pattern.restDays;
  const pos = ((daysBetween(cycleStart, date) % length) + length) % length;
  return pos < pattern.workDays;
}

export function isScheduledWorkDay(
  date: string,
  args: { version: ScheduleVersion; cycleStart: string; holidays: readonly string[] },
): boolean {
  if (args.version.holidaysOff && args.holidays.includes(date)) return false;
  return isPatternWorkDay(date, args.version.pattern, args.cycleStart);
}

export interface WorkCalendarInput {
  /** this driver's assignments, any order */
  assignments: readonly ScheduleAssignment[];
  /** versions of every schedule the assignments (and the default) refer to */
  versions: ReadonlyMap<string, readonly ScheduleVersion[]>;
  defaultScheduleId: string | null;
  /** global holidays from the timesheet settings */
  holidays: readonly string[];
}

export interface WorkCalendar {
  isWorkDay(date: string): boolean;
  /** the schedule in force on `date`; null only without any default schedule */
  scheduleIdAt(date: string): string | null;
}

/** One driver's answer to "is this a working day", across assignments and versions. */
export function buildWorkCalendar(input: WorkCalendarInput): WorkCalendar {
  const resolve = (date: string) => {
    const a = rowAt(input.assignments, date);
    const scheduleId = a?.scheduleId ?? input.defaultScheduleId;
    const version = (scheduleId && versionAt(input.versions.get(scheduleId) ?? [], date)) || FALLBACK_VERSION;
    const cycleStart = a ? (a.cycleStart ?? a.effectiveFrom) : version.effectiveFrom;
    return { scheduleId, version, cycleStart };
  };
  return {
    isWorkDay(date) {
      const r = resolve(date);
      return isScheduledWorkDay(date, { version: r.version, cycleStart: r.cycleStart, holidays: input.holidays });
    },
    scheduleIdAt(date) {
      return resolve(date).scheduleId;
    },
  };
}

/** Planned working days among `dates`. */
export function normDays(dates: readonly string[], isWorkDay: (date: string) => boolean): number {
  return dates.filter(isWorkDay).length;
}
