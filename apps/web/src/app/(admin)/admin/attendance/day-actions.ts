"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OVERRIDE_STATUSES } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getDriverMonth, type DayScan, type MonthDay } from "@/lib/attendance";
import {
  addManualScan,
  clearDayOverride,
  deleteScan,
  getDayAudit,
  reclassifyScan,
  setDayOverride,
  type AuditEntry,
  type EditResult,
} from "@/lib/attendance-admin";
import type { ActionResult } from "../actions";

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Некорректная дата");
const reasonField = z.string().trim().min(3, "Укажите причину (не короче 3 символов)").max(500);
const kindField = z.enum(["morning", "evening"]);

function done(result: EditResult, message: string): ActionResult {
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/attendance");
  revalidatePath("/driver/attendance");
  revalidatePath("/driver");
  return { ok: true, message };
}

function firstIssue(result: { success: false; error: z.ZodError }): ActionResult {
  return { ok: false, error: result.error.issues[0]?.message ?? "Проверьте заполненные поля" };
}

export interface DayDetails {
  day: MonthDay | null;
  scans: DayScan[];
  audit: AuditEntry[];
}

/** Everything the day panel shows for one driver and date. */
export async function loadDay(userId: string, date: string): Promise<DayDetails> {
  await requireRole("admin");
  const parsed = dateField.safeParse(date);
  if (!parsed.success) return { day: null, scans: [], audit: [] };
  const [month, audit] = await Promise.all([getDriverMonth(userId, date.slice(0, 7)), getDayAudit(userId, date)]);
  const day = month.days.find((d) => d.date === date) ?? null;
  return { day, scans: day?.scans ?? [], audit };
}

const addSchema = z.object({
  userId: z.string().uuid(),
  date: dateField,
  kind: kindField,
  time: z.string().regex(/^\d{2}:\d{2}$/, "Время указывается как ЧЧ:ММ"),
  reason: reasonField,
});

export async function adminAddScan(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await addManualScan({ adminId: admin.id, ...parsed.data }), "Отметка добавлена");
}

const deleteSchema = z.object({ scanId: z.string().uuid(), reason: reasonField });

export async function adminDeleteScan(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await deleteScan({ adminId: admin.id, ...parsed.data }), "Отметка удалена");
}

const reclassifySchema = z.object({ scanId: z.string().uuid(), kind: kindField, reason: reasonField });

export async function adminReclassifyScan(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = reclassifySchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await reclassifyScan({ adminId: admin.id, ...parsed.data }), "Отметка переведена");
}

const overrideSchema = z.object({
  userId: z.string().uuid(),
  date: dateField,
  status: z.enum(OVERRIDE_STATUSES),
  reason: reasonField,
});

export async function adminSetOverride(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await setDayOverride({ adminId: admin.id, ...parsed.data }), "Статус дня поставлен");
}

const clearSchema = z.object({ userId: z.string().uuid(), date: dateField, reason: reasonField });

export async function adminClearOverride(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return done(await clearDayOverride({ adminId: admin.id, ...parsed.data }), "Статус снят, день считается по отметкам");
}
