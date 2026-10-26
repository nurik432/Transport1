"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import {
  assignSchedule,
  closedBefore,
  createSchedule,
  deleteAssignment,
  deleteSchedule,
  getDriverSchedule,
  renameSchedule,
  scheduleOptions,
  setDefaultSchedule,
  setScheduleStatus,
  setScheduleVersion,
  type DriverScheduleState,
  type EditResult,
  type ScheduleOption,
} from "@/lib/work-schedules";
import type { ActionResult } from "../../actions";

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату");
const reasonField = z.string().trim().max(500).nullable().optional();
const nameField = z.string().trim().min(2, "Укажите название графика").max(80, "Название не длиннее 80 символов");

const patternField = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("weekly"), weekdays: z.array(z.number().int().min(1).max(7)) }),
  z.object({
    kind: z.literal("cycle"),
    workDays: z.coerce.number({ message: "Укажите число рабочих дней" }).int(),
    restDays: z.coerce.number({ message: "Укажите число выходных дней" }).int(),
  }),
]);

function firstIssue(result: { success: false; error: z.ZodError }): ActionResult {
  return { ok: false, error: result.error.issues[0]?.message ?? "Проверьте заполненные поля" };
}

function done(result: EditResult, fallback: string): ActionResult {
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/attendance", "layout");
  revalidatePath("/admin/drivers");
  revalidatePath("/driver/attendance");
  return { ok: true, message: result.message ?? fallback, id: result.id };
}

// ---------------------------------------------------------------- catalogue

const createSchema = z.object({ name: nameField, pattern: patternField, holidaysOff: z.boolean() });

export async function createScheduleAction(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await createSchedule({ adminId: admin.id, ...parsed.data }), "График создан");
}

const renameSchema = z.object({ id: z.string().uuid(), name: nameField });

export async function renameScheduleAction(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await renameSchedule({ adminId: admin.id, ...parsed.data }), "Название сохранено");
}

const versionSchema = z.object({
  scheduleId: z.string().uuid(),
  effectiveFrom: dateField,
  pattern: patternField,
  holidaysOff: z.boolean(),
  reason: reasonField,
});

export async function setVersionAction(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = versionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await setScheduleVersion({ adminId: admin.id, ...parsed.data, reason: parsed.data.reason ?? null }), "Версия сохранена");
}

export async function setScheduleStatusAction(id: string, status: "active" | "archived"): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["active", "archived"]) }).safeParse({ id, status });
  if (!parsed.success) return firstIssue(parsed);
  return done(await setScheduleStatus({ adminId: admin.id, ...parsed.data }), "Статус изменён");
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return firstIssue(parsed);
  return done(await deleteSchedule({ id: parsed.data }), "График удалён");
}

const defaultSchema = z.object({ id: z.string().uuid(), reason: reasonField });

export async function setDefaultAction(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = defaultSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await setDefaultSchedule({ adminId: admin.id, id: parsed.data.id, reason: parsed.data.reason ?? null }), "График по умолчанию изменён");
}

// ---------------------------------------------------------------- assignments

const assignSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1, "Выберите водителей"),
  scheduleId: z.string().uuid({ message: "Выберите график" }),
  effectiveFrom: dateField,
  cycleStart: dateField.nullable().optional(),
  reason: reasonField,
});

export async function assignScheduleAction(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const d = parsed.data;
  return done(
    await assignSchedule({ adminId: admin.id, userIds: d.userIds, scheduleId: d.scheduleId, effectiveFrom: d.effectiveFrom, cycleStart: d.cycleStart ?? null, reason: d.reason ?? null }),
    "График назначен",
  );
}

const unassignSchema = z.object({ id: z.string().uuid(), reason: reasonField });

export async function deleteAssignmentAction(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = unassignSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await deleteAssignment({ adminId: admin.id, id: parsed.data.id, reason: parsed.data.reason ?? null }), "Назначение отменено");
}

export interface DriverScheduleDialogData {
  state: DriverScheduleState;
  options: ScheduleOption[];
  /** dates before this change a timesheet already handed over */
  closedBefore: string;
}

/** What the "Сменить график" dialog shows for one driver. */
export async function loadDriverSchedule(userId: string): Promise<DriverScheduleDialogData | null> {
  await requireRole("admin");
  if (!z.string().uuid().safeParse(userId).success) return null;
  const [state, options] = await Promise.all([getDriverSchedule(userId), scheduleOptions()]);
  return { state, options, closedBefore: closedBefore() };
}
