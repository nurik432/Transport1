import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  buildWorkCalendar,
  localNow,
  normalizePattern,
  patternLabel,
  rowAt,
  validatePattern,
  versionAt,
  type ScheduleAssignment,
  type ScheduleVersion,
  type WorkCalendar,
  type WorkPattern,
  type WorkScheduleKind,
} from "@transport/domain";
import { db, schema } from "./db";
import { getAttendanceSettings } from "./attendance";
import { notify } from "./push";

const { workSchedules, workScheduleVersions, driverWorkSchedules, workScheduleAudit, drivers, users } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type VersionRow = typeof workScheduleVersions.$inferSelect;

export type EditResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

// ---------------------------------------------------------------- mapping

export function rowToVersion(r: Pick<VersionRow, "effectiveFrom" | "weekdays" | "workDays" | "restDays" | "holidaysOff">): ScheduleVersion {
  const pattern: WorkPattern =
    r.weekdays != null ? { kind: "weekly", weekdays: r.weekdays } : { kind: "cycle", workDays: r.workDays ?? 1, restDays: r.restDays ?? 0 };
  return { effectiveFrom: r.effectiveFrom, pattern, holidaysOff: r.holidaysOff };
}

function patternColumns(p: WorkPattern) {
  const n = normalizePattern(p);
  return n.kind === "weekly"
    ? { weekdays: n.weekdays, workDays: null, restDays: null }
    : { weekdays: null, workDays: n.workDays, restDays: n.restDays };
}

/** "пн–пт, праздники выходные" */
export function versionLabel(v: ScheduleVersion): string {
  return `${patternLabel(v.pattern)}${v.holidaysOff ? ", праздники выходные" : ""}`;
}

/** First day of the current month: dates before it change a timesheet already handed over. */
export function closedBefore(): string {
  return `${localNow().date.slice(0, 7)}-01`;
}

function needsReason(date: string, reason: string | null | undefined): string | null {
  if (date < closedBefore() && !reason?.trim()) {
    return "Дата раньше текущего месяца: изменится табель за прошлые месяцы. Укажите причину.";
  }
  return null;
}

async function audit(
  tx: Tx,
  row: { scheduleId: string | null; userId?: string | null; action: string; before?: unknown; after?: unknown; adminId: string; reason?: string | null },
): Promise<void> {
  await tx.insert(workScheduleAudit).values({
    scheduleId: row.scheduleId,
    userId: row.userId ?? null,
    action: row.action,
    before: (row.before ?? null) as Record<string, unknown> | null,
    after: (row.after ?? null) as Record<string, unknown> | null,
    adminId: row.adminId,
    reason: row.reason?.trim() || null,
  });
}

// ---------------------------------------------------------------- reading

async function allVersions(): Promise<Map<string, ScheduleVersion[]>> {
  const rows = await db.select().from(workScheduleVersions);
  const map = new Map<string, ScheduleVersion[]>();
  for (const r of rows) map.set(r.scheduleId, [...(map.get(r.scheduleId) ?? []), rowToVersion(r)]);
  return map;
}

async function assignmentsOf(userIds: readonly string[] | null): Promise<Map<string, ScheduleAssignment[]>> {
  if (userIds && !userIds.length) return new Map();
  const rows = await db
    .select({
      userId: driverWorkSchedules.userId,
      scheduleId: driverWorkSchedules.scheduleId,
      effectiveFrom: driverWorkSchedules.effectiveFrom,
      cycleStart: driverWorkSchedules.cycleStart,
    })
    .from(driverWorkSchedules)
    .where(userIds ? inArray(driverWorkSchedules.userId, [...userIds]) : undefined);
  const map = new Map<string, ScheduleAssignment[]>();
  for (const { userId, ...a } of rows) map.set(userId, [...(map.get(userId) ?? []), a]);
  return map;
}

export interface WorkCalendars {
  calendarOf(userId: string): WorkCalendar;
  scheduleName(scheduleId: string | null): string;
}

/**
 * Every listed driver's working days, from three small queries. The only way
 * server code should decide whether a date is a working day for a driver.
 */
export async function loadWorkCalendars(userIds: readonly string[]): Promise<WorkCalendars> {
  const [cfg, versions, assignments, schedules] = await Promise.all([
    getAttendanceSettings(),
    allVersions(),
    assignmentsOf(userIds),
    db.select({ id: workSchedules.id, name: workSchedules.name, isDefault: workSchedules.isDefault }).from(workSchedules),
  ]);
  const defaultScheduleId = schedules.find((s) => s.isDefault)?.id ?? null;
  const names = new Map(schedules.map((s) => [s.id, s.name]));
  const cache = new Map<string, WorkCalendar>();
  return {
    calendarOf(userId) {
      let cal = cache.get(userId);
      if (!cal) {
        cal = buildWorkCalendar({ assignments: assignments.get(userId) ?? [], versions, defaultScheduleId, holidays: cfg.holidays });
        cache.set(userId, cal);
      }
      return cal;
    },
    scheduleName(id) {
      return (id && names.get(id)) || "5/2 (пн–пт)";
    },
  };
}

export interface ScheduleListItem {
  id: string;
  name: string;
  kind: WorkScheduleKind;
  isDefault: boolean;
  status: "active" | "archived";
  current: ScheduleVersion | null;
  /** drivers on it today, explicitly or as the default */
  driversNow: number;
  /** ever assigned to anyone */
  used: boolean;
}

/** Which schedule each driver is on today. */
async function scheduleTodayByDriver(): Promise<Map<string, string | null>> {
  const today = localNow().date;
  const [driverRows, assignments, def] = await Promise.all([
    db.select({ userId: drivers.userId }).from(drivers),
    assignmentsOf(null),
    db.select({ id: workSchedules.id }).from(workSchedules).where(eq(workSchedules.isDefault, true)).limit(1),
  ]);
  const defaultId = def[0]?.id ?? null;
  return new Map(driverRows.map((d) => [d.userId, rowAt(assignments.get(d.userId) ?? [], today)?.scheduleId ?? defaultId]));
}

export async function listSchedules(): Promise<ScheduleListItem[]> {
  const today = localNow().date;
  const [rows, versions, todayBy, usedRows] = await Promise.all([
    db.select().from(workSchedules).orderBy(desc(workSchedules.isDefault), asc(workSchedules.status), asc(workSchedules.name)),
    allVersions(),
    scheduleTodayByDriver(),
    db.selectDistinct({ id: driverWorkSchedules.scheduleId }).from(driverWorkSchedules),
  ]);
  const used = new Set(usedRows.map((u) => u.id));
  const counts = new Map<string, number>();
  for (const id of todayBy.values()) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    isDefault: r.isDefault,
    status: r.status,
    current: versionAt(versions.get(r.id) ?? [], today),
    driversNow: counts.get(r.id) ?? 0,
    used: used.has(r.id),
  }));
}

export interface ScheduleVersionView extends ScheduleVersion {
  id: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface ScheduleDriverView {
  userId: string;
  name: string;
  /** null = on it as the default, without an assignment */
  since: string | null;
  cycleStart: string | null;
}

export interface ScheduleAuditView {
  id: string;
  action: string;
  driverName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  adminName: string | null;
  reason: string | null;
  at: Date;
}

export interface ScheduleDetail {
  schedule: typeof workSchedules.$inferSelect;
  versions: ScheduleVersionView[];
  current: ScheduleVersion | null;
  driversNow: ScheduleDriverView[];
  /** assignments to it that start after today */
  upcoming: (ScheduleDriverView & { since: string })[];
  audit: ScheduleAuditView[];
  used: boolean;
}

export async function getSchedule(id: string): Promise<ScheduleDetail | null> {
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, id)).limit(1);
  if (!row) return null;
  const today = localNow().date;
  const admin = schema.users;

  const [versionRows, todayBy, driverRows, assignments, auditRows] = await Promise.all([
    db
      .select({ v: workScheduleVersions, createdBy: admin.name })
      .from(workScheduleVersions)
      .leftJoin(admin, eq(admin.id, workScheduleVersions.createdBy))
      .where(eq(workScheduleVersions.scheduleId, id))
      .orderBy(desc(workScheduleVersions.effectiveFrom)),
    scheduleTodayByDriver(),
    db.select({ userId: drivers.userId, name: users.name }).from(drivers).innerJoin(users, eq(users.id, drivers.userId)).orderBy(asc(users.name)),
    assignmentsOf(null),
    db
      .select({
        id: workScheduleAudit.id,
        action: workScheduleAudit.action,
        before: workScheduleAudit.before,
        after: workScheduleAudit.after,
        reason: workScheduleAudit.reason,
        at: workScheduleAudit.at,
        driverName: sql<string | null>`(select u.name from ${users} u where u.id = ${workScheduleAudit.userId})`,
        adminName: sql<string | null>`(select u.name from ${users} u where u.id = ${workScheduleAudit.adminId})`,
      })
      .from(workScheduleAudit)
      .where(eq(workScheduleAudit.scheduleId, id))
      .orderBy(desc(workScheduleAudit.at))
      .limit(100),
  ]);

  const versions = versionRows.map((r) => ({ ...rowToVersion(r.v), id: r.v.id, createdBy: r.createdBy, createdAt: r.v.createdAt }));
  const driversNow: ScheduleDriverView[] = [];
  const upcoming: (ScheduleDriverView & { since: string })[] = [];
  let used = false;
  for (const d of driverRows) {
    const list = assignments.get(d.userId) ?? [];
    if (list.some((a) => a.scheduleId === id)) used = true;
    if (todayBy.get(d.userId) === id) {
      const a = rowAt(list, today);
      driversNow.push({ userId: d.userId, name: d.name, since: a?.effectiveFrom ?? null, cycleStart: a?.cycleStart ?? null });
    }
    for (const a of list) {
      if (a.scheduleId === id && a.effectiveFrom > today) {
        upcoming.push({ userId: d.userId, name: d.name, since: a.effectiveFrom, cycleStart: a.cycleStart });
      }
    }
  }
  upcoming.sort((a, b) => a.since.localeCompare(b.since));

  return {
    schedule: row,
    versions,
    current: versionAt(versions, today),
    driversNow,
    upcoming,
    audit: auditRows.map((r) => ({ ...r, before: r.before ?? null, after: r.after ?? null })),
    used,
  };
}

export interface DriverScheduleHistoryRow {
  id: string;
  scheduleId: string;
  scheduleName: string;
  kind: WorkScheduleKind;
  effectiveFrom: string;
  cycleStart: string | null;
}

export interface DriverScheduleState {
  /** schedule in force today; null = the default, without an assignment */
  currentId: string | null;
  currentName: string;
  history: DriverScheduleHistoryRow[];
}

/** One driver's assignments, newest first, and what is in force today. */
export async function getDriverSchedule(userId: string): Promise<DriverScheduleState> {
  const today = localNow().date;
  const [rows, def] = await Promise.all([
    db
      .select({
        id: driverWorkSchedules.id,
        scheduleId: driverWorkSchedules.scheduleId,
        scheduleName: workSchedules.name,
        kind: workSchedules.kind,
        effectiveFrom: driverWorkSchedules.effectiveFrom,
        cycleStart: driverWorkSchedules.cycleStart,
      })
      .from(driverWorkSchedules)
      .innerJoin(workSchedules, eq(workSchedules.id, driverWorkSchedules.scheduleId))
      .where(eq(driverWorkSchedules.userId, userId))
      .orderBy(desc(driverWorkSchedules.effectiveFrom)),
    db.select({ id: workSchedules.id, name: workSchedules.name }).from(workSchedules).where(eq(workSchedules.isDefault, true)).limit(1),
  ]);
  const now = rowAt(rows, today);
  return {
    currentId: now?.scheduleId ?? null,
    currentName: now?.scheduleName ?? def[0]?.name ?? "5/2 (пн–пт)",
    history: rows,
  };
}

/** Every driver's schedule today, for the drivers list. */
export async function scheduleNamesToday(): Promise<Map<string, string>> {
  const [todayBy, schedules] = await Promise.all([
    scheduleTodayByDriver(),
    db.select({ id: workSchedules.id, name: workSchedules.name }).from(workSchedules),
  ]);
  const names = new Map(schedules.map((s) => [s.id, s.name]));
  return new Map([...todayBy].map(([userId, id]) => [userId, (id && names.get(id)) || "5/2 (пн–пт)"]));
}

export interface ScheduleOption {
  value: string;
  label: string;
  kind: WorkScheduleKind;
}

/** Active schedules that can be assigned. */
export async function scheduleOptions(): Promise<ScheduleOption[]> {
  const today = localNow().date;
  const [rows, versions] = await Promise.all([
    db.select().from(workSchedules).where(eq(workSchedules.status, "active")).orderBy(desc(workSchedules.isDefault), asc(workSchedules.name)),
    allVersions(),
  ]);
  return rows.map((r) => {
    const v = versionAt(versions.get(r.id) ?? [], today);
    return { value: r.id, label: v ? `${r.name} · ${patternLabel(v.pattern)}` : r.name, kind: r.kind };
  });
}

// ---------------------------------------------------------------- catalogue edits

export async function createSchedule(args: {
  adminId: string;
  name: string;
  pattern: WorkPattern;
  holidaysOff: boolean;
}): Promise<EditResult> {
  const problem = validatePattern(args.pattern);
  if (problem) return { ok: false, error: problem };
  const pattern = normalizePattern(args.pattern);
  const today = localNow().date;

  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(workSchedules).values({ name: args.name, kind: pattern.kind }).returning({ id: workSchedules.id });
    await tx.insert(workScheduleVersions).values({
      scheduleId: row!.id,
      effectiveFrom: today,
      ...patternColumns(pattern),
      holidaysOff: args.holidaysOff,
      createdBy: args.adminId,
    });
    await audit(tx, {
      scheduleId: row!.id,
      action: "schedule_created",
      after: { name: args.name, label: versionLabel({ effectiveFrom: today, pattern, holidaysOff: args.holidaysOff }) },
      adminId: args.adminId,
    });
    return row!.id;
  });
  return { ok: true, id, message: "График создан" };
}

export async function renameSchedule(args: { adminId: string; id: string; name: string }): Promise<EditResult> {
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, args.id)).limit(1);
  if (!row) return { ok: false, error: "График не найден" };
  if (row.name === args.name) return { ok: true, message: "Без изменений" };
  await db.transaction(async (tx) => {
    await tx.update(workSchedules).set({ name: args.name }).where(eq(workSchedules.id, args.id));
    await audit(tx, { scheduleId: args.id, action: "renamed", before: { name: row.name }, after: { name: args.name }, adminId: args.adminId });
  });
  return { ok: true, message: "Название сохранено" };
}

/**
 * New days for a schedule from `effectiveFrom`; everyone on it follows. A
 * version on the same date is replaced. The kind never changes.
 */
export async function setScheduleVersion(args: {
  adminId: string;
  scheduleId: string;
  effectiveFrom: string;
  pattern: WorkPattern;
  holidaysOff: boolean;
  reason: string | null;
}): Promise<EditResult> {
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, args.scheduleId)).limit(1);
  if (!row) return { ok: false, error: "График не найден" };
  if (row.kind !== args.pattern.kind) return { ok: false, error: "Тип графика менять нельзя: создайте новый график" };
  const problem = validatePattern(args.pattern) ?? needsReason(args.effectiveFrom, args.reason);
  if (problem) return { ok: false, error: problem };
  const pattern = normalizePattern(args.pattern);
  const next: ScheduleVersion = { effectiveFrom: args.effectiveFrom, pattern, holidaysOff: args.holidaysOff };

  const existing = (await db.select().from(workScheduleVersions).where(eq(workScheduleVersions.scheduleId, args.scheduleId))).map((r) =>
    rowToVersion(r),
  );
  const prev = versionAt(existing, args.effectiveFrom);
  if (prev && versionLabel(prev) === versionLabel(next)) return { ok: false, error: "С этой даты график и так такой" };

  await db.transaction(async (tx) => {
    const values = { ...patternColumns(pattern), holidaysOff: args.holidaysOff, createdBy: args.adminId, createdAt: new Date() };
    await tx
      .insert(workScheduleVersions)
      .values({ scheduleId: args.scheduleId, effectiveFrom: args.effectiveFrom, ...values })
      .onConflictDoUpdate({ target: [workScheduleVersions.scheduleId, workScheduleVersions.effectiveFrom], set: values });
    await audit(tx, {
      scheduleId: args.scheduleId,
      action: "version_set",
      before: prev ? { from: prev.effectiveFrom, label: versionLabel(prev) } : null,
      after: { from: args.effectiveFrom, label: versionLabel(next) },
      adminId: args.adminId,
      reason: args.reason,
    });
  });

  // Tell the drivers on it when the change reaches today or later.
  const today = localNow().date;
  const after = [...existing.filter((v) => v.effectiveFrom !== args.effectiveFrom), next];
  if (args.effectiveFrom >= today || versionAt(after, today)?.effectiveFrom === args.effectiveFrom) {
    const todayBy = await scheduleTodayByDriver();
    const affected = [...todayBy].filter(([, id]) => id === args.scheduleId).map(([userId]) => userId);
    await notify(affected, "work_schedule_changed", {
      title: "Изменился график работы",
      body: `«${row.name}» с ${formatDay(args.effectiveFrom)}: ${versionLabel(next)}.`,
      url: "/driver/attendance",
    });
  }
  return { ok: true, message: "Новая версия графика сохранена" };
}

function formatDay(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

/** Drivers whose current or future assignment is this schedule. */
async function holdersFromToday(scheduleId: string): Promise<number> {
  const today = localNow().date;
  const assignments = await assignmentsOf(null);
  let n = 0;
  for (const list of assignments.values()) {
    if (rowAt(list, today)?.scheduleId === scheduleId || list.some((a) => a.scheduleId === scheduleId && a.effectiveFrom > today)) n += 1;
  }
  return n;
}

export async function setScheduleStatus(args: { adminId: string; id: string; status: "active" | "archived" }): Promise<EditResult> {
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, args.id)).limit(1);
  if (!row) return { ok: false, error: "График не найден" };
  if (row.status === args.status) return { ok: true };
  if (args.status === "archived") {
    if (row.isDefault) return { ok: false, error: "График по умолчанию нельзя убрать в архив: сначала назначьте другой по умолчанию" };
    const holders = await holdersFromToday(args.id);
    if (holders) return { ok: false, error: `На графике стоят водители (${holders}): сначала переведите их на другой` };
  }
  await db.transaction(async (tx) => {
    await tx.update(workSchedules).set({ status: args.status }).where(eq(workSchedules.id, args.id));
    await audit(tx, { scheduleId: args.id, action: args.status === "archived" ? "archived" : "restored", adminId: args.adminId });
  });
  return { ok: true, message: args.status === "archived" ? "График в архиве" : "График возвращён из архива" };
}

/** Only a schedule nobody was ever assigned to; the past stays explainable. */
export async function deleteSchedule(args: { id: string }): Promise<EditResult> {
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, args.id)).limit(1);
  if (!row) return { ok: false, error: "График не найден" };
  if (row.isDefault) return { ok: false, error: "График по умолчанию удалить нельзя" };
  const used = await db.select({ id: driverWorkSchedules.id }).from(driverWorkSchedules).where(eq(driverWorkSchedules.scheduleId, args.id)).limit(1);
  if (used.length) return { ok: false, error: "График уже назначался водителям, его можно только убрать в архив" };
  await db.delete(workSchedules).where(eq(workSchedules.id, args.id));
  return { ok: true, message: "График удалён" };
}

/**
 * Drivers without an assignment move to this schedule for every date, past
 * included, so the change asks for a reason like any edit of the past.
 */
export async function setDefaultSchedule(args: { adminId: string; id: string; reason: string | null }): Promise<EditResult> {
  const [row] = await db.select().from(workSchedules).where(eq(workSchedules.id, args.id)).limit(1);
  if (!row) return { ok: false, error: "График не найден" };
  if (row.isDefault) return { ok: true };
  if (row.status !== "active") return { ok: false, error: "Сначала верните график из архива" };
  if (!args.reason?.trim()) return { ok: false, error: "Укажите причину: водители без назначения пересчитаются за все месяцы" };
  const [prev] = await db.select().from(workSchedules).where(eq(workSchedules.isDefault, true)).limit(1);
  await db.transaction(async (tx) => {
    await tx.update(workSchedules).set({ isDefault: false }).where(eq(workSchedules.isDefault, true));
    await tx.update(workSchedules).set({ isDefault: true }).where(eq(workSchedules.id, args.id));
    await audit(tx, {
      scheduleId: args.id,
      action: "default_changed",
      before: prev ? { name: prev.name } : null,
      after: { name: row.name },
      adminId: args.adminId,
      reason: args.reason,
    });
  });
  return { ok: true, message: "График назначен по умолчанию" };
}

// ---------------------------------------------------------------- assignments

/**
 * Put drivers on a schedule from a date. An assignment on the same date is
 * replaced. For a cycle the first working day defaults to the date itself.
 */
export async function assignSchedule(args: {
  adminId: string;
  userIds: string[];
  scheduleId: string;
  effectiveFrom: string;
  cycleStart: string | null;
  reason: string | null;
}): Promise<EditResult> {
  const userIds = [...new Set(args.userIds)];
  if (!userIds.length) return { ok: false, error: "Выберите водителей" };
  const [sched] = await db.select().from(workSchedules).where(eq(workSchedules.id, args.scheduleId)).limit(1);
  if (!sched) return { ok: false, error: "График не найден" };
  if (sched.status !== "active") return { ok: false, error: "График в архиве, его нельзя назначить" };
  const problem = needsReason(args.effectiveFrom, args.reason);
  if (problem) return { ok: false, error: problem };
  const cycleStart = sched.kind === "cycle" ? (args.cycleStart ?? args.effectiveFrom) : null;

  const known = await db
    .select({ userId: drivers.userId, name: users.name })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.userId))
    .where(inArray(drivers.userId, userIds));
  if (known.length !== userIds.length) return { ok: false, error: "Водитель не найден" };

  const before = await getStatesAt(userIds, args.effectiveFrom);
  await db.transaction(async (tx) => {
    for (const userId of userIds) {
      const values = { scheduleId: args.scheduleId, cycleStart, createdBy: args.adminId, createdAt: new Date() };
      await tx
        .insert(driverWorkSchedules)
        .values({ userId, effectiveFrom: args.effectiveFrom, ...values })
        .onConflictDoUpdate({ target: [driverWorkSchedules.userId, driverWorkSchedules.effectiveFrom], set: values });
      await audit(tx, {
        scheduleId: args.scheduleId,
        userId,
        action: "assigned",
        before: before.get(userId) ?? null,
        after: { schedule: sched.name, from: args.effectiveFrom, cycleStart },
        adminId: args.adminId,
        reason: args.reason,
      });
    }
  });

  if (args.effectiveFrom >= closedBefore()) {
    await notify(userIds, "work_schedule_changed", {
      title: "Вам назначен график работы",
      body: `«${sched.name}» с ${formatDay(args.effectiveFrom)}${cycleStart ? `, первый рабочий день ${formatDay(cycleStart)}` : ""}.`,
      url: "/driver/attendance",
    });
  }
  return { ok: true, message: userIds.length === 1 ? "График назначен" : `График назначен водителям: ${userIds.length}` };
}

async function getStatesAt(userIds: string[], date: string): Promise<Map<string, Record<string, unknown>>> {
  const [assignments, schedules] = await Promise.all([
    assignmentsOf(userIds),
    db.select({ id: workSchedules.id, name: workSchedules.name, isDefault: workSchedules.isDefault }).from(workSchedules),
  ]);
  const names = new Map(schedules.map((s) => [s.id, s.name]));
  const def = schedules.find((s) => s.isDefault);
  return new Map(
    userIds.map((u) => {
      const a = rowAt(assignments.get(u) ?? [], date);
      return [u, a ? { schedule: names.get(a.scheduleId) ?? null, from: a.effectiveFrom } : { schedule: def?.name ?? null, default: true }];
    }),
  );
}

/** Undo a wrong assignment; the previous one is in force again. */
export async function deleteAssignment(args: { adminId: string; id: string; reason: string | null }): Promise<EditResult> {
  const [row] = await db
    .select({ a: driverWorkSchedules, name: workSchedules.name })
    .from(driverWorkSchedules)
    .innerJoin(workSchedules, eq(workSchedules.id, driverWorkSchedules.scheduleId))
    .where(eq(driverWorkSchedules.id, args.id))
    .limit(1);
  if (!row) return { ok: false, error: "Назначение не найдено" };
  const problem = needsReason(row.a.effectiveFrom, args.reason);
  if (problem) return { ok: false, error: problem };
  await db.transaction(async (tx) => {
    await tx.delete(driverWorkSchedules).where(eq(driverWorkSchedules.id, args.id));
    await audit(tx, {
      scheduleId: row.a.scheduleId,
      userId: row.a.userId,
      action: "unassigned",
      before: { schedule: row.name, from: row.a.effectiveFrom, cycleStart: row.a.cycleStart },
      adminId: args.adminId,
      reason: args.reason,
    });
  });
  return { ok: true, message: "Назначение отменено" };
}

/** Drivers for the bulk assignment picker. */
export async function driverOptions(): Promise<{ value: string; label: string; active: boolean }[]> {
  const rows = await db
    .select({ id: drivers.userId, name: users.name, status: drivers.status, userStatus: users.status })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.userId))
    .where(eq(users.role, "driver"))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ value: r.id, label: r.name, active: r.status === "active" && r.userStatus === "active" }));
}

export const SCHEDULE_AUDIT_LABEL: Record<string, string> = {
  schedule_created: "График создан",
  renamed: "Переименован",
  version_set: "Новая версия",
  archived: "Убран в архив",
  restored: "Возвращён из архива",
  default_changed: "Стал графиком по умолчанию",
  assigned: "Назначен водителю",
  unassigned: "Назначение отменено",
};
