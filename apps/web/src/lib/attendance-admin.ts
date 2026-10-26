import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
  computeDay,
  dayCode,
  formatLocalTime,
  localDateTime,
  localNow,
  monthDates,
  normDays,
  parseTimeToMinutes,
  summarizeMonth,
  type AttendanceSettings,
  type DayVerdict,
  type MonthTotals,
  type OverrideStatus,
} from "@transport/domain";
import { db, schema } from "./db";
import { KIND_LABEL, getAttendanceSettings } from "./attendance";
import { loadWorkCalendars } from "./work-schedules";

const { attendanceScans, attendanceDayOverrides, attendanceAudit, users, drivers } = schema;

// ---------------------------------------------------------------- month report

export interface MonthCell {
  date: string;
  code: string;
  verdict: DayVerdict | null;
  /** a working day by this driver's schedule */
  working: boolean;
}

export interface MonthRow {
  userId: string;
  name: string;
  phone: string;
  active: boolean;
  /** schedule in force on the last day of the month shown (or today) */
  scheduleName: string;
  /** working days in the month by the schedule */
  norm: number;
  /** one cell per date of the month, in order; future dates carry no verdict */
  cells: MonthCell[];
  totals: MonthTotals;
}

export interface MonthReport {
  month: string;
  dates: string[];
  today: string;
  rows: MonthRow[];
  settings: AttendanceSettings;
}

/**
 * Every driver's month in one grid: active drivers, plus anyone with a scan or
 * a verdict inside the month, so a driver who left mid-month keeps the days
 * they worked.
 */
export async function getMonthReport(month: string): Promise<MonthReport> {
  const dates = monthDates(month);
  const [first, last] = [dates[0]!, dates.at(-1)!];
  const today = localNow().date;

  const [cfg, people, scanRows, overrideRows] = await Promise.all([
    getAttendanceSettings(),
    db
      .select({ userId: users.id, name: users.name, phone: users.phone, status: drivers.status, userStatus: users.status })
      .from(drivers)
      .innerJoin(users, eq(users.id, drivers.userId))
      .where(
        or(
          and(eq(drivers.status, "active"), eq(users.status, "active")),
          sql`exists (select 1 from ${attendanceScans} sc where sc.user_id = ${drivers}.user_id and sc.date between ${first} and ${last})`,
          sql`exists (select 1 from ${attendanceDayOverrides} ov where ov.user_id = ${drivers}.user_id and ov.date between ${first} and ${last})`,
        ),
      )
      .orderBy(asc(users.name)),
    db
      .select({
        userId: attendanceScans.userId,
        date: attendanceScans.date,
        kind: attendanceScans.kind,
        duplicate: attendanceScans.duplicate,
        deletedAt: attendanceScans.deletedAt,
      })
      .from(attendanceScans)
      .where(and(gte(attendanceScans.date, first), lte(attendanceScans.date, last))),
    db
      .select({ userId: attendanceDayOverrides.userId, date: attendanceDayOverrides.date, status: attendanceDayOverrides.status })
      .from(attendanceDayOverrides)
      .where(and(gte(attendanceDayOverrides.date, first), lte(attendanceDayOverrides.date, last))),
  ]);

  const scansBy = new Map<string, typeof scanRows>();
  for (const r of scanRows) {
    const key = `${r.userId}:${r.date}`;
    scansBy.set(key, [...(scansBy.get(key) ?? []), r]);
  }
  const overrideBy = new Map(overrideRows.map((o) => [`${o.userId}:${o.date}`, o]));
  const calendars = await loadWorkCalendars(people.map((p) => p.userId));
  const labelDate = last < today ? last : today < first ? first : today;

  const rows: MonthRow[] = people.map((p) => {
    const cal = calendars.calendarOf(p.userId);
    const days = dates
      .filter((d) => d <= today)
      .map((date) => {
        const working = cal.isWorkDay(date);
        const verdict = computeDay({
          scans: scansBy.get(`${p.userId}:${date}`) ?? [],
          override: overrideBy.get(`${p.userId}:${date}`) ?? null,
          working,
        });
        return { date, verdict, working };
      });
    const byDate = new Map(days.map((d) => [d.date, d.verdict]));
    return {
      userId: p.userId,
      name: p.name,
      phone: p.phone,
      active: p.status === "active" && p.userStatus === "active",
      scheduleName: calendars.scheduleName(cal.scheduleIdAt(labelDate)),
      norm: normDays(dates, cal.isWorkDay),
      cells: dates.map((date) => {
        const verdict = byDate.get(date) ?? null;
        return { date, verdict, working: cal.isWorkDay(date), code: verdict ? dayCode(verdict) : "" };
      }),
      totals: summarizeMonth(days),
    };
  });

  return { month, dates, today, rows, settings: cfg };
}

// ---------------------------------------------------------------- edits

export type EditResult = { ok: true } | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface AuditRow {
  userId: string;
  date: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  adminId: string;
  reason: string | null;
}

async function audit(tx: Tx, row: AuditRow): Promise<void> {
  await tx.insert(attendanceAudit).values({ ...row, before: row.before ?? null, after: row.after ?? null });
}

async function isDriver(userId: string): Promise<boolean> {
  const rows = await db.select({ id: drivers.userId }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
  return rows.length > 0;
}

/** Is there already a counted scan of this kind on this day? */
async function windowTaken(userId: string, date: string, kind: "morning" | "evening"): Promise<boolean> {
  const rows = await db
    .select({ id: attendanceScans.id })
    .from(attendanceScans)
    .where(
      and(
        eq(attendanceScans.userId, userId),
        eq(attendanceScans.date, date),
        eq(attendanceScans.kind, kind),
        eq(attendanceScans.duplicate, false),
        isNull(attendanceScans.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** An administrator adds the scan the driver could not make. Counted like a real one. */
export async function addManualScan(args: {
  adminId: string;
  userId: string;
  date: string;
  kind: "morning" | "evening";
  time: string;
  reason: string;
}): Promise<EditResult> {
  if (!(await isDriver(args.userId))) return { ok: false, error: "Водитель не найден" };
  if (args.date > localNow().date) return { ok: false, error: "Нельзя отметить будущий день" };
  if (await windowTaken(args.userId, args.date, args.kind)) return { ok: false, error: `${KIND_LABEL[args.kind]} этого дня уже отмечено` };
  const scannedAt = localDateTime(args.date, parseTimeToMinutes(args.time));

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(attendanceScans)
      .values({
        userId: args.userId,
        pointId: null,
        scannedAt,
        date: args.date,
        kind: args.kind,
        geo: "unverified",
        source: "manual",
        createdBy: args.adminId,
        reason: args.reason,
      })
      .returning({ id: attendanceScans.id });
    await audit(tx, {
      userId: args.userId,
      date: args.date,
      action: "scan_added",
      after: { scanId: row!.id, kind: args.kind, time: args.time },
      adminId: args.adminId,
      reason: args.reason,
    });
  });
  return { ok: true };
}

/** Soft delete: the row stays for the record, the day is recomputed without it. */
export async function deleteScan(args: { adminId: string; scanId: string; reason: string }): Promise<EditResult> {
  const rows = await db.select().from(attendanceScans).where(eq(attendanceScans.id, args.scanId)).limit(1);
  const scan = rows[0];
  if (!scan) return { ok: false, error: "Отметка не найдена" };
  if (scan.deletedAt) return { ok: false, error: "Отметка уже удалена" };

  await db.transaction(async (tx) => {
    await tx
      .update(attendanceScans)
      .set({ deletedAt: new Date(), deletedBy: args.adminId, deleteReason: args.reason })
      .where(eq(attendanceScans.id, scan.id));
    await audit(tx, {
      userId: scan.userId,
      date: scan.date,
      action: "scan_deleted",
      before: { scanId: scan.id, kind: scan.kind, time: formatLocalTime(scan.scannedAt), source: scan.source },
      adminId: args.adminId,
      reason: args.reason,
    });
  });
  return { ok: true };
}

/** Move an off-window or mis-timed scan into a window. */
export async function reclassifyScan(args: {
  adminId: string;
  scanId: string;
  kind: "morning" | "evening";
  reason: string;
}): Promise<EditResult> {
  const rows = await db.select().from(attendanceScans).where(eq(attendanceScans.id, args.scanId)).limit(1);
  const scan = rows[0];
  if (!scan || scan.deletedAt) return { ok: false, error: "Отметка не найдена" };
  if (scan.kind === args.kind && !scan.duplicate) return { ok: true };
  if (await windowTaken(scan.userId, scan.date, args.kind)) return { ok: false, error: `${KIND_LABEL[args.kind]} этого дня уже отмечено` };

  await db.transaction(async (tx) => {
    await tx.update(attendanceScans).set({ kind: args.kind, duplicate: false }).where(eq(attendanceScans.id, scan.id));
    await audit(tx, {
      userId: scan.userId,
      date: scan.date,
      action: "scan_reclassified",
      before: { scanId: scan.id, kind: scan.kind, duplicate: scan.duplicate },
      after: { scanId: scan.id, kind: args.kind },
      adminId: args.adminId,
      reason: args.reason,
    });
  });
  return { ok: true };
}

async function currentOverride(userId: string, date: string) {
  const rows = await db
    .select({ status: attendanceDayOverrides.status, reason: attendanceDayOverrides.reason })
    .from(attendanceDayOverrides)
    .where(and(eq(attendanceDayOverrides.userId, userId), eq(attendanceDayOverrides.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

/** The administrator's verdict for a day; replaces any previous one. */
export async function setDayOverride(args: {
  adminId: string;
  userId: string;
  date: string;
  status: OverrideStatus;
  reason: string;
}): Promise<EditResult> {
  if (!(await isDriver(args.userId))) return { ok: false, error: "Водитель не найден" };
  const prev = await currentOverride(args.userId, args.date);

  await db.transaction(async (tx) => {
    const values = { status: args.status, reason: args.reason, createdBy: args.adminId, createdAt: new Date() };
    await tx
      .insert(attendanceDayOverrides)
      .values({ userId: args.userId, date: args.date, ...values })
      .onConflictDoUpdate({ target: [attendanceDayOverrides.userId, attendanceDayOverrides.date], set: values });
    await audit(tx, {
      userId: args.userId,
      date: args.date,
      action: prev ? "override_changed" : "override_set",
      before: prev,
      after: { status: args.status },
      adminId: args.adminId,
      reason: args.reason,
    });
  });
  return { ok: true };
}

/** Back to what the scans say. */
export async function clearDayOverride(args: { adminId: string; userId: string; date: string; reason: string }): Promise<EditResult> {
  const prev = await currentOverride(args.userId, args.date);
  if (!prev) return { ok: false, error: "Статус не был установлен" };

  await db.transaction(async (tx) => {
    await tx
      .delete(attendanceDayOverrides)
      .where(and(eq(attendanceDayOverrides.userId, args.userId), eq(attendanceDayOverrides.date, args.date)));
    await audit(tx, { userId: args.userId, date: args.date, action: "override_cleared", before: prev, adminId: args.adminId, reason: args.reason });
  });
  return { ok: true };
}

// ---------------------------------------------------------------- audit

export interface AuditEntry {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  adminName: string | null;
  reason: string | null;
  at: Date;
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  scan_added: "Добавлена отметка",
  scan_deleted: "Удалена отметка",
  scan_reclassified: "Отметка переведена",
  override_set: "Поставлен статус",
  override_changed: "Изменён статус",
  override_cleared: "Статус снят",
};

/** What administrators did to this driver's day, newest first. */
export async function getDayAudit(userId: string, date: string): Promise<AuditEntry[]> {
  const rows = await db
    .select({
      id: attendanceAudit.id,
      action: attendanceAudit.action,
      before: attendanceAudit.before,
      after: attendanceAudit.after,
      adminName: users.name,
      reason: attendanceAudit.reason,
      at: attendanceAudit.at,
    })
    .from(attendanceAudit)
    .leftJoin(users, eq(users.id, attendanceAudit.adminId))
    .where(and(eq(attendanceAudit.userId, userId), eq(attendanceAudit.date, date)))
    .orderBy(desc(attendanceAudit.at));
  return rows.map((r) => ({ ...r, before: r.before ?? null, after: r.after ?? null }));
}
