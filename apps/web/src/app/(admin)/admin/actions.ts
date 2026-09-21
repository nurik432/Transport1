"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { addDays, weekdayOfDate, type LoadThresholds } from "@transport/domain";
import { db, schema } from "@/lib/db";
import { hashPassword, requireRole } from "@/lib/auth";
import { saveThresholds } from "@/lib/queries";

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  id?: string;
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function parse<T extends z.ZodTypeAny>(schemaDef: T, data: unknown): z.infer<T> | { __error: string } {
  const result = schemaDef.safeParse(data);
  if (result.success) return result.data;
  return { __error: result.error.issues[0]?.message ?? "Проверьте заполненные поля" };
}

function isError(v: unknown): v is { __error: string } {
  return typeof v === "object" && v !== null && "__error" in v;
}

function refreshAdmin(...paths: string[]) {
  revalidatePath("/admin");
  for (const p of paths) revalidatePath(p);
}

// ---------------------------------------------------------------- stops

const stopSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Укажите название остановки"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  address: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function saveStop(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(stopSchema, input);
  if (isError(data)) return fail(data.__error);

  if (data.id) {
    await db
      .update(schema.stops)
      .set({ name: data.name, lat: data.lat, lng: data.lng, address: data.address || null, status: data.status })
      .where(eq(schema.stops.id, data.id));
    refreshAdmin("/admin/stops", "/app");
    return { ok: true, id: data.id, message: "Остановка сохранена" };
  }

  const rows = await db
    .insert(schema.stops)
    .values({ name: data.name, lat: data.lat, lng: data.lng, address: data.address || null, status: data.status })
    .returning({ id: schema.stops.id });
  refreshAdmin("/admin/stops", "/app");
  return { ok: true, id: rows[0]!.id, message: "Остановка создана" };
}

export async function deleteStop(id: string): Promise<ActionResult> {
  await requireRole("admin");
  const used = await db.select({ n: sql<number>`count(*)` }).from(schema.routeStops).where(eq(schema.routeStops.stopId, id));
  if (Number(used[0]?.n ?? 0) > 0) {
    return fail("Остановка используется в маршрутах. Сначала уберите её из маршрутов или переведите в неактивные.");
  }
  await db.delete(schema.stops).where(eq(schema.stops.id, id));
  refreshAdmin("/admin/stops");
  return { ok: true, message: "Остановка удалена" };
}

// ---------------------------------------------------------------- routes

const routeStopSchema = z.object({
  stopId: z.string().uuid(),
  offsetMin: z.coerce.number().int().min(0).max(600),
});

const routeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Укажите номер маршрута"),
  description: z.string().trim().optional(),
  direction: z.enum(["to_work", "from_work"]),
  status: z.enum(["draft", "active", "inactive"]).default("active"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Цвет должен быть в формате #RRGGBB")
    .default("#2563eb"),
  plannedCapacity: z.coerce.number().int().min(0).max(200).nullable().optional(),
  stops: z.array(routeStopSchema).min(2, "В маршруте должно быть минимум две остановки"),
  departures: z.array(z.string().regex(/^\d{2}:\d{2}$/, "Время в формате ЧЧ:ММ")).default([]),
  daysOfWeek: z.array(z.coerce.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
});

export async function saveRoute(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const data = parse(routeSchema, input);
  if (isError(data)) return fail(data.__error);

  const uniqueStops = new Set(data.stops.map((s) => s.stopId));
  if (uniqueStops.size !== data.stops.length) return fail("Остановка не может повторяться в маршруте");

  const values = {
    name: data.name,
    description: data.description || null,
    direction: data.direction,
    status: data.status,
    color: data.color,
    plannedCapacity: data.plannedCapacity ?? null,
    updatedAt: new Date(),
  };

  let routeId = data.id;
  let created = false;
  if (routeId) {
    await db.update(schema.routes).set(values).where(eq(schema.routes.id, routeId));
  } else {
    const rows = await db.insert(schema.routes).values(values).returning({ id: schema.routes.id });
    routeId = rows[0]!.id;
    created = true;
  }

  // Replace stops and schedules: simplest correct approach for the MVP.
  await db.delete(schema.routeStops).where(eq(schema.routeStops.routeId, routeId));
  await db
    .insert(schema.routeStops)
    .values(data.stops.map((s, i) => ({ routeId: routeId!, stopId: s.stopId, seq: i + 1, offsetMin: s.offsetMin })));

  const existingSchedules = await db
    .select()
    .from(schema.routeSchedules)
    .where(eq(schema.routeSchedules.routeId, routeId));
  const wanted = new Set(data.departures);
  const toDelete = existingSchedules.filter((s) => !wanted.has(s.departureTime.slice(0, 5)));
  const existingTimes = new Set(existingSchedules.map((s) => s.departureTime.slice(0, 5)));
  const toInsert = data.departures.filter((t) => !existingTimes.has(t));

  if (toDelete.length) {
    const ids = toDelete.map((s) => s.id);
    // Keep history: planned future trips of removed departures are cancelled.
    await db.update(schema.trips).set({ status: "cancelled" }).where(
      and(inArray(schema.trips.scheduleId, ids), eq(schema.trips.status, "planned")),
    );
    await db.delete(schema.routeSchedules).where(inArray(schema.routeSchedules.id, ids));
  }
  if (toInsert.length) {
    await db
      .insert(schema.routeSchedules)
      .values(toInsert.map((t) => ({ routeId: routeId!, departureTime: `${t}:00`, daysOfWeek: data.daysOfWeek })));
  }
  await db
    .update(schema.routeSchedules)
    .set({ daysOfWeek: data.daysOfWeek })
    .where(eq(schema.routeSchedules.routeId, routeId));

  if (!created) await notifyRouteAudience(routeId, admin.id, data.name);

  refreshAdmin("/admin/routes", `/admin/routes/${routeId}`, "/app", "/app/routes");
  return { ok: true, id: routeId, message: created ? "Маршрут создан" : "Маршрут обновлён" };
}

/** Tell the route's drivers and booked passengers that it changed. */
async function notifyRouteAudience(routeId: string, _adminId: string, routeName: string): Promise<void> {
  const horizon = new Date().toISOString().slice(0, 10);
  const recipients = await db
    .selectDistinct({ userId: schema.passengerTrips.passengerId })
    .from(schema.passengerTrips)
    .innerJoin(schema.trips, eq(schema.trips.id, schema.passengerTrips.tripId))
    .where(and(eq(schema.trips.routeId, routeId), gte(schema.trips.date, horizon)));
  const drivers = await db
    .selectDistinct({ userId: schema.trips.driverId })
    .from(schema.trips)
    .where(and(eq(schema.trips.routeId, routeId), gte(schema.trips.date, horizon)));

  const userIds = [...new Set([...recipients.map((r) => r.userId), ...drivers.map((d) => d.userId)].filter(Boolean))] as string[];
  if (!userIds.length) return;

  await db.insert(schema.notifications).values(
    userIds.map((userId) => ({
      userId,
      type: "route_changed" as const,
      title: `Маршрут ${routeName} изменён`,
      body: "Проверьте остановки и расписание перед поездкой.",
      payload: { routeId },
    })),
  );
}

export async function deleteRoute(id: string): Promise<ActionResult> {
  await requireRole("admin");
  const completed = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.trips)
    .where(and(eq(schema.trips.routeId, id), eq(schema.trips.status, "completed")));
  if (Number(completed[0]?.n ?? 0) > 0) {
    await db.update(schema.routes).set({ status: "inactive" }).where(eq(schema.routes.id, id));
    refreshAdmin("/admin/routes");
    return { ok: true, message: "У маршрута есть история рейсов — он переведён в неактивные" };
  }
  await db.delete(schema.routes).where(eq(schema.routes.id, id));
  refreshAdmin("/admin/routes");
  return { ok: true, message: "Маршрут удалён" };
}

// ---------------------------------------------------------------- vehicles

const vehicleSchema = z.object({
  id: z.string().uuid().optional(),
  number: z.string().trim().min(3, "Укажите гос. номер"),
  model: z.string().trim().min(2, "Укажите модель"),
  capacity: z.coerce.number().int().min(1, "Вместимость должна быть больше нуля").max(200),
  status: z.enum(["active", "repair", "inactive"]).default("active"),
});

export async function saveVehicle(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(vehicleSchema, input);
  if (isError(data)) return fail(data.__error);

  try {
    if (data.id) {
      await db
        .update(schema.vehicles)
        .set({ number: data.number, model: data.model, capacity: data.capacity, status: data.status })
        .where(eq(schema.vehicles.id, data.id));
      refreshAdmin("/admin/vehicles");
      return { ok: true, id: data.id, message: "Транспорт сохранён" };
    }
    const rows = await db
      .insert(schema.vehicles)
      .values({ number: data.number, model: data.model, capacity: data.capacity, status: data.status })
      .returning({ id: schema.vehicles.id });
    refreshAdmin("/admin/vehicles");
    return { ok: true, id: rows[0]!.id, message: "Транспорт добавлен" };
  } catch {
    return fail("Транспорт с таким номером уже существует");
  }
}

export async function deleteVehicle(id: string): Promise<ActionResult> {
  await requireRole("admin");
  const used = await db.select({ n: sql<number>`count(*)` }).from(schema.trips).where(eq(schema.trips.vehicleId, id));
  if (Number(used[0]?.n ?? 0) > 0) {
    await db.update(schema.vehicles).set({ status: "inactive" }).where(eq(schema.vehicles.id, id));
    refreshAdmin("/admin/vehicles");
    return { ok: true, message: "Транспорт участвовал в рейсах — переведён в неактивные" };
  }
  await db.delete(schema.vehicles).where(eq(schema.vehicles.id, id));
  refreshAdmin("/admin/vehicles");
  return { ok: true, message: "Транспорт удалён" };
}

// ---------------------------------------------------------------- people

const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d+]/g, ""))
  .refine((v) => v.replace(/\D/g, "").length >= 9, "Укажите телефон полностью");

const personSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Укажите имя"),
  phone: phoneSchema,
  password: z.string().min(6, "Пароль не короче 6 символов").optional().or(z.literal("")),
  status: z.enum(["active", "blocked"]).default("active"),
});

const driverSchema = personSchema.extend({
  vehicleId: z.string().uuid().nullable().optional(),
  driverStatus: z.enum(["active", "inactive"]).default("active"),
});

const passengerSchema = personSchema.extend({
  department: z.string().trim().optional(),
  homeAddress: z.string().trim().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
});

async function upsertUser(
  data: { id?: string; name: string; phone: string; password?: string; status: "active" | "blocked" },
  role: "driver" | "passenger",
): Promise<{ id: string; created: boolean } | ActionResult> {
  if (data.id) {
    const set: Record<string, unknown> = { name: data.name, phone: data.phone, status: data.status };
    if (data.password) set.passwordHash = await hashPassword(data.password);
    await db.update(schema.users).set(set).where(eq(schema.users.id, data.id));
    return { id: data.id, created: false };
  }
  if (!data.password) return fail("Задайте пароль для нового пользователя");
  const rows = await db
    .insert(schema.users)
    .values({
      name: data.name,
      phone: data.phone,
      role,
      status: data.status,
      passwordHash: await hashPassword(data.password),
    })
    .returning({ id: schema.users.id });
  return { id: rows[0]!.id, created: true };
}

export async function saveDriver(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(driverSchema, input);
  if (isError(data)) return fail(data.__error);

  try {
    const user = await upsertUser(data, "driver");
    if ("ok" in user) return user;
    await db
      .insert(schema.drivers)
      .values({ userId: user.id, vehicleId: data.vehicleId ?? null, status: data.driverStatus })
      .onConflictDoUpdate({
        target: schema.drivers.userId,
        set: { vehicleId: data.vehicleId ?? null, status: data.driverStatus },
      });
    refreshAdmin("/admin/drivers");
    return { ok: true, id: user.id, message: user.created ? "Водитель добавлен" : "Данные водителя сохранены" };
  } catch {
    return fail("Пользователь с таким телефоном уже существует");
  }
}

export async function savePassenger(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(passengerSchema, input);
  if (isError(data)) return fail(data.__error);

  try {
    const user = await upsertUser(data, "passenger");
    if ("ok" in user) return user;
    await db
      .insert(schema.passengers)
      .values({
        userId: user.id,
        department: data.department || null,
        homeAddress: data.homeAddress || null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
      })
      .onConflictDoUpdate({
        target: schema.passengers.userId,
        set: {
          department: data.department || null,
          homeAddress: data.homeAddress || null,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
        },
      });
    refreshAdmin("/admin/passengers");
    return { ok: true, id: user.id, message: user.created ? "Пассажир добавлен" : "Данные пассажира сохранены" };
  } catch {
    return fail("Пользователь с таким телефоном уже существует");
  }
}

export async function setUserStatus(userId: string, status: "active" | "blocked"): Promise<ActionResult> {
  await requireRole("admin");
  await db.update(schema.users).set({ status }).where(eq(schema.users.id, userId));
  if (status === "blocked") await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  refreshAdmin("/admin/drivers", "/admin/passengers");
  return { ok: true, message: status === "blocked" ? "Доступ заблокирован" : "Доступ восстановлен" };
}

// ---------------------------------------------------------------- trips

const generateSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  routeId: z.string().uuid().optional().or(z.literal("")),
});

/**
 * Create trips from active schedules for a date range.
 * Vehicle and driver are copied from the route's most recent trip, or from the
 * driver whose default vehicle matches; unassigned trips can be filled in later.
 */
export async function generateTrips(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(generateSchema, input);
  if (isError(data)) return fail(data.__error);
  if (data.to < data.from) return fail("Конечная дата раньше начальной");

  const days = Math.round((Date.parse(`${data.to}T00:00:00Z`) - Date.parse(`${data.from}T00:00:00Z`)) / 86_400_000);
  if (days > 60) return fail("Максимальный период — 60 дней");

  const routeFilter = data.routeId ? eq(schema.routes.id, data.routeId) : eq(schema.routes.status, "active");
  const schedules = await db
    .select({
      scheduleId: schema.routeSchedules.id,
      routeId: schema.routeSchedules.routeId,
      departureTime: schema.routeSchedules.departureTime,
      daysOfWeek: schema.routeSchedules.daysOfWeek,
      active: schema.routeSchedules.active,
    })
    .from(schema.routeSchedules)
    .innerJoin(schema.routes, eq(schema.routes.id, schema.routeSchedules.routeId))
    .where(and(routeFilter, eq(schema.routes.status, "active"), eq(schema.routeSchedules.active, true)));
  if (!schedules.length) return fail("Нет активных расписаний для генерации");

  const routeIds = [...new Set(schedules.map((s) => s.routeId))];
  const lastAssignments = await db
    .select({ routeId: schema.trips.routeId, vehicleId: schema.trips.vehicleId, driverId: schema.trips.driverId })
    .from(schema.trips)
    .where(inArray(schema.trips.routeId, routeIds))
    .orderBy(desc(schema.trips.date));
  const assignment = new Map<string, { vehicleId: string | null; driverId: string | null }>();
  for (const a of lastAssignments) if (!assignment.has(a.routeId)) assignment.set(a.routeId, a);

  const existing = await db
    .select({ routeId: schema.trips.routeId, date: schema.trips.date, startTime: schema.trips.startTime })
    .from(schema.trips)
    .where(and(inArray(schema.trips.routeId, routeIds), gte(schema.trips.date, data.from), lte(schema.trips.date, data.to)));
  const seen = new Set(existing.map((e) => `${e.routeId}|${e.date}|${e.startTime}`));

  const rows: (typeof schema.trips.$inferInsert)[] = [];
  for (let d = 0; d <= days; d++) {
    const date = addDays(data.from, d);
    const weekday = weekdayOfDate(date);
    for (const s of schedules) {
      if (!s.daysOfWeek.includes(weekday)) continue;
      if (seen.has(`${s.routeId}|${date}|${s.departureTime}`)) continue;
      const a = assignment.get(s.routeId);
      rows.push({
        routeId: s.routeId,
        scheduleId: s.scheduleId,
        vehicleId: a?.vehicleId ?? null,
        driverId: a?.driverId ?? null,
        date,
        startTime: s.departureTime,
        status: "planned",
      });
    }
  }

  if (!rows.length) return { ok: true, message: "Все рейсы на этот период уже созданы" };
  await db.insert(schema.trips).values(rows).onConflictDoNothing();
  refreshAdmin("/admin/trips");
  return { ok: true, message: `Создано рейсов: ${rows.length}` };
}

export async function assignTrip(tripId: string, vehicleId: string | null, driverId: string | null): Promise<ActionResult> {
  await requireRole("admin");
  await db
    .update(schema.trips)
    .set({ vehicleId: vehicleId || null, driverId: driverId || null })
    .where(eq(schema.trips.id, tripId));
  refreshAdmin("/admin/trips", "/driver");
  return { ok: true, message: "Назначение сохранено" };
}

export async function cancelTrip(tripId: string): Promise<ActionResult> {
  await requireRole("admin");
  const rows = await db
    .select({ routeId: schema.trips.routeId, date: schema.trips.date, startTime: schema.trips.startTime, driverId: schema.trips.driverId })
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId))
    .limit(1);
  const trip = rows[0];
  if (!trip) return fail("Рейс не найден");

  await db.update(schema.trips).set({ status: "cancelled" }).where(eq(schema.trips.id, tripId));

  const routeRows = await db.select({ name: schema.routes.name }).from(schema.routes).where(eq(schema.routes.id, trip.routeId)).limit(1);
  const bookedUsers = await db
    .select({ userId: schema.passengerTrips.passengerId })
    .from(schema.passengerTrips)
    .where(and(eq(schema.passengerTrips.tripId, tripId), ne(schema.passengerTrips.status, "cancelled")));
  const recipients = [...new Set([...bookedUsers.map((b) => b.userId), trip.driverId].filter(Boolean))] as string[];

  if (recipients.length) {
    await db.insert(schema.notifications).values(
      recipients.map((userId) => ({
        userId,
        type: "trip_cancelled" as const,
        title: `Рейс ${trip.startTime.slice(0, 5)} отменён`,
        body: `Маршрут ${routeRows[0]?.name ?? ""} на ${trip.date}. Выберите другой рейс.`,
        payload: { tripId },
      })),
    );
  }

  refreshAdmin("/admin/trips", "/app", "/driver");
  return { ok: true, message: "Рейс отменён, уведомления отправлены" };
}

// ---------------------------------------------------------------- notifications & settings

const messageSchema = z.object({
  audience: z.enum(["route_passengers", "route_driver", "all_drivers", "all_passengers"]),
  routeId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(3, "Укажите заголовок"),
  body: z.string().trim().min(3, "Укажите текст сообщения"),
});

export async function sendMessage(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(messageSchema, input);
  if (isError(data)) return fail(data.__error);

  const today = new Date().toISOString().slice(0, 10);
  let userIds: string[] = [];

  if (data.audience === "all_drivers") {
    const rows = await db.select({ id: schema.drivers.userId }).from(schema.drivers).where(eq(schema.drivers.status, "active"));
    userIds = rows.map((r) => r.id);
  } else if (data.audience === "all_passengers") {
    const rows = await db.select({ id: schema.passengers.userId }).from(schema.passengers);
    userIds = rows.map((r) => r.id);
  } else {
    if (!data.routeId) return fail("Выберите маршрут");
    if (data.audience === "route_driver") {
      const rows = await db
        .selectDistinct({ id: schema.trips.driverId })
        .from(schema.trips)
        .where(and(eq(schema.trips.routeId, data.routeId), gte(schema.trips.date, today)));
      userIds = rows.map((r) => r.id).filter(Boolean) as string[];
    } else {
      const rows = await db
        .selectDistinct({ id: schema.passengerTrips.passengerId })
        .from(schema.passengerTrips)
        .innerJoin(schema.trips, eq(schema.trips.id, schema.passengerTrips.tripId))
        .where(and(eq(schema.trips.routeId, data.routeId), gte(schema.trips.date, today)));
      userIds = rows.map((r) => r.id);
    }
  }

  if (!userIds.length) return fail("Нет получателей для выбранной аудитории");

  await db.insert(schema.notifications).values(
    userIds.map((userId) => ({
      userId,
      type: "admin_message" as const,
      title: data.title,
      body: data.body,
      payload: data.routeId ? { routeId: data.routeId } : {},
    })),
  );
  refreshAdmin("/admin/messages");
  return { ok: true, message: `Отправлено получателям: ${userIds.length}` };
}

const thresholdSchema = z.object({
  overloadPct: z.coerce.number().min(50).max(200),
  overloadShare: z.coerce.number().min(0).max(1),
  overloadAvgPct: z.coerce.number().min(50).max(200),
  lowAvgPct: z.coerce.number().min(0).max(100),
  minTrips: z.coerce.number().int().min(1).max(100),
});

export async function updateThresholds(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(thresholdSchema, input);
  if (isError(data)) return fail(data.__error);
  if (data.lowAvgPct >= data.overloadAvgPct) return fail("Порог низкой загрузки должен быть меньше порога перегрузки");
  await saveThresholds(data as LoadThresholds);
  refreshAdmin("/admin/settings", "/admin/analytics");
  return { ok: true, message: "Пороги сохранены" };
}

export async function listStopOptions() {
  await requireRole("admin");
  return db.select({ id: schema.stops.id, name: schema.stops.name }).from(schema.stops).orderBy(asc(schema.stops.name));
}
