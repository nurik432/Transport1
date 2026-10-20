import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  DEFAULT_ATTENDANCE_SETTINGS,
  checkScanGeo,
  classifyScanTime,
  computeDay,
  formatLocalTime,
  localNow,
  monthDates,
  summarizeMonth,
  windowsLabel,
  type AttendanceSettings,
  type DayVerdict,
  type GeoVerdict,
  type MonthTotals,
  type ScanKind,
  type ScanPosition,
} from "@transport/domain";
import { db, schema } from "./db";

const { attendancePoints, attendanceScans, attendanceDayOverrides, settings, trips, routes } = schema;

const SETTINGS_KEY = "attendance";

// ---------------------------------------------------------------- settings

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const row = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1);
  const value = row[0]?.value as Partial<AttendanceSettings> | undefined;
  return { ...DEFAULT_ATTENDANCE_SETTINGS, ...(value ?? {}) };
}

export async function saveAttendanceSettings(next: AttendanceSettings): Promise<void> {
  const value = next as unknown as Record<string, unknown>;
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

// ---------------------------------------------------------------- points

/** URL-safe secret for a printed QR. */
export function newPointToken(): string {
  return randomBytes(18).toString("base64url");
}

export async function findPointByToken(token: string) {
  const rows = await db.select().from(attendancePoints).where(eq(attendancePoints.token, token)).limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- scans

export const KIND_LABEL: Record<ScanKind, string> = { morning: "Утро", evening: "Вечер", off_window: "Вне окна" };

export const GEO_LABEL: Record<GeoVerdict, string> = {
  verified: "На месте",
  unverified: "Без геопроверки",
  out_of_range: "Далеко от точки",
};

export type ScanResult =
  | {
      ok: true;
      kind: ScanKind;
      geo: GeoVerdict;
      /** a repeat inside a window that already had a scan */
      duplicate: boolean;
      /** the scan changes the day (in a window, first of its kind) */
      counted: boolean;
      time: string;
      message: string;
    }
  | { ok: false; error: string };

/**
 * One scan of a QR by the signed-in driver. Server time decides the date and the
 * window; the client only contributes its position. Facts are always written,
 * including repeats and off-window scans, so a dispute can be settled later.
 */
export async function recordScan(args: { userId: string; token: string; position: ScanPosition | null }): Promise<ScanResult> {
  const point = await findPointByToken(args.token);
  if (!point) return { ok: false, error: "Код не распознан. Попросите администратора перевыпустить QR." };
  if (point.status !== "active") return { ok: false, error: "Точка отключена, обратитесь к диспетчеру." };

  const [cfg, now] = [await getAttendanceSettings(), localNow()];
  const kind = classifyScanTime(now.minutes, cfg);
  const { geo } = checkScanGeo(point, args.position, cfg);

  const existing =
    kind === "off_window"
      ? []
      : await db
          .select({ scannedAt: attendanceScans.scannedAt })
          .from(attendanceScans)
          .where(
            and(
              eq(attendanceScans.userId, args.userId),
              eq(attendanceScans.date, now.date),
              eq(attendanceScans.kind, kind),
              eq(attendanceScans.duplicate, false),
              isNull(attendanceScans.deletedAt),
            ),
          )
          .orderBy(asc(attendanceScans.scannedAt))
          .limit(1);
  const duplicate = existing.length > 0;
  const tripId = kind === "off_window" ? null : await todaysTrip(args.userId, now.date, kind);

  await db.insert(attendanceScans).values({
    userId: args.userId,
    pointId: point.id,
    scannedAt: now.instant,
    date: now.date,
    kind,
    geo,
    lat: args.position?.lat ?? null,
    lng: args.position?.lng ?? null,
    accuracyM: args.position?.accuracyM ?? null,
    duplicate,
    source: "qr",
    tripId,
  });

  const time = formatLocalTime(now.instant);
  if (kind === "off_window") {
    return { ok: true, kind, geo, duplicate: false, counted: false, time, message: `Сейчас не время отметки: ${windowsLabel(cfg)}.` };
  }
  if (duplicate) {
    const first = formatLocalTime(existing[0]!.scannedAt);
    return { ok: true, kind, geo, duplicate, counted: false, time, message: `${KIND_LABEL[kind]} уже отмечено в ${first}.` };
  }
  return { ok: true, kind, geo, duplicate, counted: true, time, message: `${KIND_LABEL[kind]} отмечено, ${time}.` };
}

/** The driver's trip the scan belongs to: morning → to work, evening → from work. */
async function todaysTrip(userId: string, date: string, kind: "morning" | "evening"): Promise<string | null> {
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .where(
      and(
        eq(trips.driverId, userId),
        eq(trips.date, date),
        eq(routes.direction, kind === "morning" ? "to_work" : "from_work"),
        inArray(trips.status, ["planned", "in_progress", "completed"]),
      ),
    )
    .orderBy(desc(trips.startTime))
    .limit(1);
  return rows[0]?.id ?? null;
}

// ---------------------------------------------------------------- reading

export interface TodayMarks {
  date: string;
  morning: string | null;
  evening: string | null;
}

/** Times of today's counted scans, for the driver's home screen. */
export async function getTodayMarks(userId: string): Promise<TodayMarks> {
  const today = localNow().date;
  const rows = await db
    .select({ kind: attendanceScans.kind, scannedAt: attendanceScans.scannedAt })
    .from(attendanceScans)
    .where(
      and(
        eq(attendanceScans.userId, userId),
        eq(attendanceScans.date, today),
        eq(attendanceScans.duplicate, false),
        isNull(attendanceScans.deletedAt),
      ),
    )
    .orderBy(asc(attendanceScans.scannedAt));
  const at = (kind: ScanKind) => {
    const r = rows.find((x) => x.kind === kind);
    return r ? formatLocalTime(r.scannedAt) : null;
  };
  return { date: today, morning: at("morning"), evening: at("evening") };
}

export interface DayScan {
  id: string;
  kind: ScanKind;
  geo: GeoVerdict;
  duplicate: boolean;
  source: "qr" | "manual";
  scannedAt: Date;
  time: string;
  pointName: string | null;
  deletedAt: Date | null;
}

export interface MonthDay {
  date: string;
  verdict: DayVerdict;
  scans: DayScan[];
  overrideReason: string | null;
}

export interface DriverMonth {
  month: string;
  days: MonthDay[];
  totals: MonthTotals;
  settings: AttendanceSettings;
}

/** One driver's month, newest day first, for "Мой табель" and the admin's day panel. */
export async function getDriverMonth(userId: string, month: string): Promise<DriverMonth> {
  const dates = monthDates(month);
  const [first, last] = [dates[0]!, dates.at(-1)!];
  const [cfg, scanRows, overrideRows] = await Promise.all([
    getAttendanceSettings(),
    db
      .select({
        id: attendanceScans.id,
        date: attendanceScans.date,
        kind: attendanceScans.kind,
        geo: attendanceScans.geo,
        duplicate: attendanceScans.duplicate,
        source: attendanceScans.source,
        scannedAt: attendanceScans.scannedAt,
        deletedAt: attendanceScans.deletedAt,
        pointName: attendancePoints.name,
      })
      .from(attendanceScans)
      .leftJoin(attendancePoints, eq(attendancePoints.id, attendanceScans.pointId))
      .where(and(eq(attendanceScans.userId, userId), gte(attendanceScans.date, first), lte(attendanceScans.date, last)))
      .orderBy(asc(attendanceScans.scannedAt)),
    db
      .select()
      .from(attendanceDayOverrides)
      .where(and(eq(attendanceDayOverrides.userId, userId), gte(attendanceDayOverrides.date, first), lte(attendanceDayOverrides.date, last))),
  ]);

  const byDate = new Map<string, DayScan[]>();
  for (const r of scanRows) {
    const list = byDate.get(r.date) ?? [];
    list.push({ ...r, time: formatLocalTime(r.scannedAt) });
    byDate.set(r.date, list);
  }
  const overrideByDate = new Map(overrideRows.map((o) => [o.date, o]));

  const today = localNow().date;
  const days: MonthDay[] = dates
    .filter((d) => d <= today)
    .map((date) => {
      const scans = byDate.get(date) ?? [];
      const override = overrideByDate.get(date) ?? null;
      return {
        date,
        scans,
        overrideReason: override?.reason ?? null,
        verdict: computeDay({ date, scans, override, settings: cfg }),
      };
    })
    .reverse();

  return { month, days, totals: summarizeMonth(days, cfg), settings: cfg };
}
