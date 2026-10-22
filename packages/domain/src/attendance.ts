import { distanceMeters, formatDistance, type LatLng } from "./geo";
import { addDays, formatMinutes, parseTimeToMinutes, weekdayOfDate } from "./time";

/**
 * Driver timesheet by QR. A driver scans the printed code at the gate twice a
 * day: in the morning after bringing people to work and in the evening before
 * taking them home. Two scans make a full day. Everything here is pure: the
 * server stores scans as facts and asks these functions what a day means.
 */

export interface AttendanceWindow {
  /** "HH:MM", inclusive */
  from: string;
  /** "HH:MM", inclusive */
  to: string;
}

export interface AttendanceSettings {
  morning: AttendanceWindow;
  evening: AttendanceWindow;
  /** metres; used by points without their own radius */
  defaultRadiusM: number;
  /** YYYY-MM-DD dates that are not working days although they fall on Mon–Fri */
  holidays: string[];
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  morning: { from: "06:00", to: "11:00" },
  evening: { from: "15:00", to: "21:00" },
  defaultRadiusM: 300,
  holidays: [],
};

export type ScanKind = "morning" | "evening" | "off_window";
export type GeoVerdict = "verified" | "unverified" | "out_of_range";
export type OverrideStatus = "worked" | "not_worked" | "vacation" | "sick" | "day_off";
/** full/partial/none come from scans, the rest from an administrator. */
export type DayStatus = "full" | "partial" | "none" | OverrideStatus;

/** Which window a local time (minutes since midnight) falls into. */
export function classifyScanTime(minutes: number, settings: AttendanceSettings): ScanKind {
  if (inWindow(minutes, settings.morning)) return "morning";
  if (inWindow(minutes, settings.evening)) return "evening";
  return "off_window";
}

function inWindow(minutes: number, w: AttendanceWindow): boolean {
  return minutes >= parseTimeToMinutes(w.from) && minutes <= parseTimeToMinutes(w.to);
}

/**
 * Why the windows cannot be saved, or null when they can. Windows must not
 * cross midnight (a scan belongs to one calendar date) and must not overlap
 * (a scan has exactly one kind).
 */
export function validateAttendanceWindows(settings: Pick<AttendanceSettings, "morning" | "evening">): string | null {
  let m: number[];
  try {
    m = [settings.morning.from, settings.morning.to, settings.evening.from, settings.evening.to].map(parseTimeToMinutes);
  } catch {
    return "Время указывается как ЧЧ:ММ";
  }
  const [mFrom, mTo, eFrom, eTo] = m as [number, number, number, number];
  if (mFrom >= mTo) return "Утреннее окно должно заканчиваться позже, чем начинается";
  if (eFrom >= eTo) return "Вечернее окно должно заканчиваться позже, чем начинается";
  if (mTo >= eFrom) return "Утреннее окно должно закончиться до начала вечернего";
  return null;
}

/** "утро 06:00–11:00, вечер 15:00–21:00" */
export function windowsLabel(settings: AttendanceSettings): string {
  const w = (x: AttendanceWindow) => `${formatMinutes(parseTimeToMinutes(x.from))}–${formatMinutes(parseTimeToMinutes(x.to))}`;
  return `утро ${w(settings.morning)}, вечер ${w(settings.evening)}`;
}

export interface PointLike extends LatLng {
  radiusM: number | null;
}

export interface ScanPosition extends LatLng {
  accuracyM: number | null;
}

export interface GeoCheck {
  geo: GeoVerdict;
  distanceM: number | null;
  radiusM: number;
}

/**
 * Was the phone really at the point? No position, or a fix too coarse to tell,
 * is "unverified". A good fix far away is "out_of_range". Both are refused,
 * see `scanGeoRejection`.
 */
export function checkScanGeo(point: PointLike, pos: ScanPosition | null, settings: AttendanceSettings): GeoCheck {
  const radiusM = point.radiusM ?? settings.defaultRadiusM;
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return { geo: "unverified", distanceM: null, radiusM };
  const distanceM = distanceMeters(point, pos);
  if (pos.accuracyM != null && pos.accuracyM > radiusM) return { geo: "unverified", distanceM, radiusM };
  return { geo: distanceM <= radiusM ? "verified" : "out_of_range", distanceM, radiusM };
}

/**
 * Why a scan is refused, or null when the phone is inside the point's zone.
 * Only a precise fix inside the radius is accepted: no position or a coarse
 * one cannot prove the driver was there.
 */
export function scanGeoRejection(check: GeoCheck, pos: ScanPosition | null): string | null {
  if (check.geo === "verified") return null;
  if (check.distanceM == null) {
    return "Не удалось определить местоположение. Разрешите доступ к геолокации и повторите у точки отметки.";
  }
  if (check.geo === "unverified") {
    const acc = pos?.accuracyM != null ? ` (±${formatDistance(pos.accuracyM)})` : "";
    return `Местоположение определено неточно${acc}. Включите точную геолокацию, выйдите на открытое место и повторите.`;
  }
  return `Вы в ${formatDistance(check.distanceM)} от точки отметки. Отметка принимается только в радиусе ${formatDistance(check.radiusM)} от точки.`;
}

/** Mon–Fri and not a holiday. */
export function isWorkingDay(date: string, settings: Pick<AttendanceSettings, "holidays">): boolean {
  return weekdayOfDate(date) <= 5 && !settings.holidays.includes(date);
}

/** How long before a window closes a driver without a scan is reminded. */
export const REMINDER_LEAD_MIN = 30;

/**
 * The window whose reminder is due at this local time, or null. Due during the
 * last `leadMin` minutes of a window on a working day; a window shorter than
 * that is covered whole.
 */
export function reminderDue(
  date: string,
  minutes: number,
  settings: AttendanceSettings,
  leadMin: number = REMINDER_LEAD_MIN,
): "morning" | "evening" | null {
  if (!isWorkingDay(date, settings)) return null;
  for (const kind of ["morning", "evening"] as const) {
    const w = settings[kind];
    const end = parseTimeToMinutes(w.to);
    const start = Math.max(parseTimeToMinutes(w.from), end - leadMin);
    if (minutes >= start && minutes <= end) return kind;
  }
  return null;
}

export interface ScanLike {
  kind: ScanKind;
  duplicate: boolean;
  deletedAt: Date | string | null;
}

export interface OverrideLike {
  status: OverrideStatus;
}

export interface DayVerdict {
  status: DayStatus;
  /** the verdict came from an administrator, not from scans */
  overridden: boolean;
  /** worked on a weekend or holiday */
  offSchedule: boolean;
  morning: boolean;
  evening: boolean;
}

/** The scans that count: not deleted, not repeats, inside a window. */
export function countedScans<T extends ScanLike>(scans: readonly T[]): T[] {
  return scans.filter((s) => !s.deletedAt && !s.duplicate && s.kind !== "off_window");
}

/**
 * What a day is worth. An administrator's override wins outright; otherwise
 * two windows covered = full, one = partial, none = none.
 */
export function computeDay(args: {
  date: string;
  scans: readonly ScanLike[];
  override: OverrideLike | null;
  settings: AttendanceSettings;
}): DayVerdict {
  const counted = countedScans(args.scans);
  const morning = counted.some((s) => s.kind === "morning");
  const evening = counted.some((s) => s.kind === "evening");
  const working = isWorkingDay(args.date, args.settings);

  if (args.override) {
    return { status: args.override.status, overridden: true, offSchedule: false, morning, evening };
  }
  const status: DayStatus = morning && evening ? "full" : morning || evening ? "partial" : "none";
  return { status, overridden: false, offSchedule: status !== "none" && !working, morning, evening };
}

/** Short codes for the month grid and the spreadsheet. */
export function dayCode(v: DayVerdict): string {
  switch (v.status) {
    case "full":
    case "worked":
      return v.offSchedule ? "Яв" : "Я";
    case "partial":
      return "Н";
    case "none":
      return "";
    case "not_worked":
      return "НН";
    case "vacation":
      return "О";
    case "sick":
      return "Б";
    case "day_off":
      return "В";
  }
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  full: "Полный день",
  partial: "Неполный день",
  none: "Нет отметок",
  worked: "Отработал",
  not_worked: "Не отработал",
  vacation: "Отпуск",
  sick: "Больничный",
  day_off: "Выходной",
};

export const OVERRIDE_STATUSES: OverrideStatus[] = ["worked", "not_worked", "vacation", "sick", "day_off"];

/** All YYYY-MM-DD dates of a "YYYY-MM" month. */
export function monthDates(month: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Invalid month: ${month}`);
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

export interface MonthTotals {
  full: number;
  partial: number;
  /** working days with no scans and no verdict */
  missing: number;
  vacation: number;
  sick: number;
  dayOff: number;
  notWorked: number;
}

/** Per-driver totals for a month, from the per-day verdicts. */
export function summarizeMonth(days: readonly { date: string; verdict: DayVerdict }[], settings: AttendanceSettings): MonthTotals {
  const t: MonthTotals = { full: 0, partial: 0, missing: 0, vacation: 0, sick: 0, dayOff: 0, notWorked: 0 };
  for (const { date, verdict } of days) {
    switch (verdict.status) {
      case "full":
      case "worked":
        t.full += 1;
        break;
      case "partial":
        t.partial += 1;
        break;
      case "none":
        if (isWorkingDay(date, settings)) t.missing += 1;
        break;
      case "vacation":
        t.vacation += 1;
        break;
      case "sick":
        t.sick += 1;
        break;
      case "day_off":
        t.dayOff += 1;
        break;
      case "not_worked":
        t.notWorked += 1;
        break;
    }
  }
  return t;
}
