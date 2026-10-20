"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { validateAttendanceWindows, type AttendanceSettings } from "@transport/domain";
import { db, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getAttendanceSettings, newPointToken, saveAttendanceSettings } from "@/lib/attendance";
import type { ActionResult } from "../actions";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function firstIssue(result: { success: false; error: z.ZodError }): string {
  return result.error.issues[0]?.message ?? "Проверьте заполненные поля";
}

function refresh() {
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/attendance/points");
  revalidatePath("/admin/settings");
}

// ---------------------------------------------------------------- points

const pointSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Укажите название точки"),
  lat: z.coerce.number({ message: "Укажите широту" }).min(-90).max(90),
  lng: z.coerce.number({ message: "Укажите долготу" }).min(-180).max(180),
  radiusM: z.coerce.number().int().min(20, "Радиус не меньше 20 м").max(5000, "Радиус не больше 5 км").nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

/** Create or update a scanning point. The token is minted once, on creation. */
export async function savePoint(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = pointSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed));
  const { id, ...data } = parsed.data;
  const values = { ...data, radiusM: data.radiusM ?? null };

  if (id) {
    const updated = await db.update(schema.attendancePoints).set(values).where(eq(schema.attendancePoints.id, id)).returning({ id: schema.attendancePoints.id });
    if (!updated.length) return fail("Точка не найдена");
    refresh();
    return { ok: true, message: "Точка сохранена", id };
  }
  const [row] = await db
    .insert(schema.attendancePoints)
    .values({ ...values, token: newPointToken() })
    .returning({ id: schema.attendancePoints.id });
  refresh();
  return { ok: true, message: "Точка добавлена", id: row!.id };
}

/** Void every printout of this point: a new token, the old URL stops working. */
export async function reissuePointToken(id: string): Promise<ActionResult> {
  await requireRole("admin");
  const updated = await db
    .update(schema.attendancePoints)
    .set({ token: newPointToken() })
    .where(eq(schema.attendancePoints.id, id))
    .returning({ id: schema.attendancePoints.id });
  if (!updated.length) return fail("Точка не найдена");
  refresh();
  return { ok: true, message: "QR перевыпущен: старые распечатки больше не работают" };
}

export async function setPointStatus(id: string, status: "active" | "inactive"): Promise<ActionResult> {
  await requireRole("admin");
  const updated = await db
    .update(schema.attendancePoints)
    .set({ status })
    .where(eq(schema.attendancePoints.id, id))
    .returning({ id: schema.attendancePoints.id });
  if (!updated.length) return fail("Точка не найдена");
  refresh();
  return { ok: true, message: status === "active" ? "Точка включена" : "Точка отключена" };
}

// ---------------------------------------------------------------- settings

const timeField = z.string().trim().regex(/^\d{2}:\d{2}$/, "Время указывается как ЧЧ:ММ");

const settingsSchema = z.object({
  morningFrom: timeField,
  morningTo: timeField,
  eveningFrom: timeField,
  eveningTo: timeField,
  defaultRadiusM: z.coerce.number().int().min(20, "Радиус не меньше 20 м").max(5000, "Радиус не больше 5 км"),
  /** dates separated by commas, spaces or new lines */
  holidays: z.string().default(""),
});

/** Windows, default radius and holidays of the timesheet. */
export async function updateAttendanceSettings(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed));
  const d = parsed.data;

  const holidays = d.holidays
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const bad = holidays.find((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h) || Number.isNaN(Date.parse(`${h}T00:00:00Z`)));
  if (bad) return fail(`Праздник «${bad}» должен быть датой вида ГГГГ-ММ-ДД`);

  const next: AttendanceSettings = {
    ...(await getAttendanceSettings()),
    morning: { from: d.morningFrom, to: d.morningTo },
    evening: { from: d.eveningFrom, to: d.eveningTo },
    defaultRadiusM: d.defaultRadiusM,
    holidays: [...new Set(holidays)].sort(),
  };
  const problem = validateAttendanceWindows(next);
  if (problem) return fail(problem);

  await saveAttendanceSettings(next);
  refresh();
  return { ok: true, message: "Настройки табеля сохранены" };
}
