"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  addDays,
  canManageUser,
  departureCrew,
  departureLabel,
  localNow,
  MAX_VEHICLES_PER_DEPARTURE,
  validateRouteForm,
  vehiclesPerTime,
  weekdayOfDate,
  type LoadThresholds,
  type RouteFormInput,
} from "@transport/domain";
import { db, schema } from "@/lib/db";
import { changeOwnPassword, hashPassword, requireRole } from "@/lib/auth";
import { saveThresholds } from "@/lib/queries";
import { notify } from "@/lib/push";
import { rebuildAllRouteGeometry, rebuildVersionGeometry } from "@transport/db/routing";
import { saveDeviationSettings } from "@/lib/live";
import { tripLabel, tripVehicleNo, tripVehiclesAtTime } from "@/lib/trip-vehicle";
import {
  attachPassenger,
  bookSubscribers,
  countDroppedSubscriptions,
  detachSubscription,
  dropPassengerRides,
  dropSubscriptions,
  type SubscriptionRow,
} from "@/lib/subscriptions";

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  id?: string;
  /** message per form field, so a screen can mark the field that is wrong */
  fieldErrors?: Record<string, string>;
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Failure the form can attribute: a summary plus one message per field. */
function failFields(error: string, fieldErrors: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}

interface ParseFail {
  __error: string;
  /** first problem found on each field, keyed by its path ("lat", "stops.2.offsetMin") */
  __fields: Record<string, string>;
}

/**
 * `__error` stays the single summary line every caller already shows, while
 * `__fields` lets the few forms that support it point at the actual field.
 */
function parse<T extends z.ZodTypeAny>(schemaDef: T, data: unknown): z.infer<T> | ParseFail {
  const result = schemaDef.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (key && !(key in fields)) fields[key] = issue.message;
  }
  return { __error: result.error.issues[0]?.message ?? "Проверьте заполненные поля", __fields: fields };
}

function isError(v: unknown): v is ParseFail {
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
  if (isError(data)) return failFields(data.__error, data.__fields);

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

const moveStopSchema = z.object({
  id: z.string().uuid(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * Move a stop to a new place, touching nothing else.
 * Deliberately not `saveStop`: that one needs a name and a status and clears the
 * address when the form sends an empty one, which is wrong for a drag on a map.
 *
 * Route geometry is not rebuilt here. Reshaping every route that uses the stop
 * would be expensive and would contradict the rule that the router is called
 * only when a route changes or on request, so the message says when the path
 * will catch up instead of quietly doing it.
 */
export async function moveStop(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(moveStopSchema, input);
  if (isError(data)) return failFields(data.__error, data.__fields);

  const updated = await db
    .update(schema.stops)
    .set({ lat: data.lat, lng: data.lng })
    .where(eq(schema.stops.id, data.id))
    .returning({ name: schema.stops.name });
  if (!updated[0]) return fail("Остановка не найдена");

  refreshAdmin("/admin/stops", "/admin/routes", "/app");
  return {
    ok: true,
    id: data.id,
    message: `Остановка «${updated[0].name}» перенесена. Путь маршрутов с ней пересчитается при следующем сохранении маршрута или кнопкой «Построить путь по дорогам».`,
  };
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
  /** null for a point placed on the map: the stop is created on save */
  stopId: z.string().uuid().nullable().optional(),
  name: z.string().trim().optional(),
  /** filled in by the place search, kept on the stop that gets created */
  address: z.string().trim().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
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
  stops: z.array(routeStopSchema),
  departures: z
    .array(
      z.object({
        time: z.string().regex(/^\d{2}:\d{2}$/, "Время в формате ЧЧ:ММ"),
        vehicles: z.coerce
          .number()
          .int()
          .min(1)
          .max(MAX_VEHICLES_PER_DEPARTURE, `Машин на одно отправление — не больше ${MAX_VEHICLES_PER_DEPARTURE}`)
          .default(1),
        /** one entry per vehicle, машина 1 first */
        crew: z
          .array(
            z.object({
              driverId: z.string().uuid().nullable().catch(null),
              vehicleId: z.string().uuid().nullable().catch(null),
            }),
          )
          .max(MAX_VEHICLES_PER_DEPARTURE)
          .optional(),
      }),
    )
    .default([]),
  daysOfWeek: z.array(z.coerce.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
  /** what changed, stored with the new version */
  versionNote: z.string().trim().max(200).optional(),
});

/** The form as the shared rules see it; zod has already checked shapes and types. */
function routeFormInput(data: z.infer<typeof routeSchema>): RouteFormInput {
  return {
    name: data.name,
    direction: data.direction,
    status: data.status,
    color: data.color,
    plannedCapacity: data.plannedCapacity ?? null,
    stops: data.stops.map((s) => ({
      stopId: s.stopId ?? null,
      name: s.name ?? "",
      lat: s.lat ?? 0,
      lng: s.lng ?? 0,
      offsetMin: s.offsetMin,
    })),
    departures: data.departures,
    daysOfWeek: data.daysOfWeek,
  };
}

interface WantedSchedule {
  time: string;
  vehicleNo: number;
  driverId: string | null;
  vehicleId: string | null;
}

/**
 * The schedule rows a form asks for: one per vehicle of every departure,
 * keyed "HH:MM#vehicleNo" so stored rows and wanted rows compare directly.
 */
function wantedSchedules(departures: readonly RouteFormInput["departures"][number][]): Map<string, WantedSchedule> {
  const wanted = new Map<string, WantedSchedule>();
  for (const d of departures) {
    for (let n = 1; n <= d.vehicles; n++) {
      wanted.set(`${d.time}#${n}`, { time: d.time, vehicleNo: n, ...departureCrew(d, n) });
    }
  }
  return wanted;
}

/**
 * A driver or vehicle the form puts on a departure that another route already
 * runs them on at the same time and on a shared weekday.
 */
async function scheduleCrewClash(
  routeId: string | undefined,
  wanted: readonly WantedSchedule[],
  daysOfWeek: readonly number[],
): Promise<string | null> {
  const driverIds = [...new Set(wanted.map((w) => w.driverId).filter((v): v is string => Boolean(v)))];
  const vehicleIds = [...new Set(wanted.map((w) => w.vehicleId).filter((v): v is string => Boolean(v)))];
  if (!driverIds.length && !vehicleIds.length) return null;

  const crewFilter =
    driverIds.length && vehicleIds.length
      ? or(inArray(schema.routeSchedules.driverId, driverIds), inArray(schema.routeSchedules.vehicleId, vehicleIds))
      : driverIds.length
        ? inArray(schema.routeSchedules.driverId, driverIds)
        : inArray(schema.routeSchedules.vehicleId, vehicleIds);
  const others = await db
    .select({
      routeName: schema.routes.name,
      departureTime: schema.routeSchedules.departureTime,
      daysOfWeek: schema.routeSchedules.daysOfWeek,
      driverId: schema.routeSchedules.driverId,
      vehicleId: schema.routeSchedules.vehicleId,
    })
    .from(schema.routeSchedules)
    .innerJoin(schema.routes, eq(schema.routes.id, schema.routeSchedules.routeId))
    .where(
      and(
        routeId ? ne(schema.routeSchedules.routeId, routeId) : undefined,
        ne(schema.routes.status, "inactive"),
        eq(schema.routeSchedules.active, true),
        crewFilter,
      ),
    );

  for (const w of wanted) {
    for (const o of others) {
      if (o.departureTime.slice(0, 5) !== w.time) continue;
      if (!o.daysOfWeek.some((d) => daysOfWeek.includes(d))) continue;
      if (w.driverId && o.driverId === w.driverId) {
        return `Водитель уже закреплён за маршрутом ${o.routeName} в ${w.time}`;
      }
      if (w.vehicleId && o.vehicleId === w.vehicleId) {
        return `Транспорт уже закреплён за маршрутом ${o.routeName} в ${w.time}`;
      }
    }
  }
  return null;
}

type Crew = { driverId: string | null; vehicleId: string | null };

/**
 * Put a departure's crew on its planned trips from `fromDate` on. By default
 * only the empty places are filled, so a trip crewed by hand keeps its crew;
 * `overwrite` replaces it. A trip where that person or vehicle is already busy
 * at the same moment is skipped either way.
 */
async function applyCrewToTrips(
  scheduleId: string,
  crew: Crew,
  { fromDate = localNow().date, overwrite = false }: { fromDate?: string; overwrite?: boolean } = {},
): Promise<{ updated: number; skipped: number }> {
  const open = await db
    .select({
      id: schema.trips.id,
      date: schema.trips.date,
      startTime: schema.trips.startTime,
      driverId: schema.trips.driverId,
      vehicleId: schema.trips.vehicleId,
    })
    .from(schema.trips)
    .where(and(eq(schema.trips.scheduleId, scheduleId), eq(schema.trips.status, "planned"), gte(schema.trips.date, fromDate)));

  let updated = 0;
  let skipped = 0;
  for (const trip of open) {
    const set: Partial<Crew> = {};
    let clashed = false;
    for (const [field, column] of [
      ["driverId", schema.trips.driverId],
      ["vehicleId", schema.trips.vehicleId],
    ] as const) {
      const value = crew[field];
      if (trip[field] === value || (!overwrite && trip[field])) continue;
      if (value && (await crewClash(trip, column, value))) {
        clashed = true;
        continue;
      }
      set[field] = value;
    }
    if (clashed) skipped++;
    if (!Object.keys(set).length) continue;
    await db.update(schema.trips).set(set).where(eq(schema.trips.id, trip.id));
    updated++;
  }
  return { updated, skipped };
}

function scheduleKey(s: { departureTime: string; vehicleNo: number }): string {
  return `${s.departureTime.slice(0, 5)}#${s.vehicleNo}`;
}

/** Create stops for points placed on the map, and return the final stop ids. */
async function resolveRouteStops(
  stops: z.infer<typeof routeSchema>["stops"],
): Promise<{ stopId: string; offsetMin: number }[] | ActionResult> {
  const resolved: { stopId: string; offsetMin: number }[] = [];

  for (const stop of stops) {
    if (stop.stopId) {
      resolved.push({ stopId: stop.stopId, offsetMin: stop.offsetMin });
      continue;
    }
    if (stop.lat === undefined || stop.lng === undefined) {
      return fail("У новой точки не указаны координаты");
    }
    const created = await db
      .insert(schema.stops)
      .values({
        name: stop.name?.trim() || "Новая остановка",
        lat: stop.lat,
        lng: stop.lng,
        address: stop.address?.trim() || null,
        status: "active",
      })
      .returning({ id: schema.stops.id });
    resolved.push({ stopId: created[0]!.id, offsetMin: stop.offsetMin });
  }

  const unique = new Set(resolved.map((r) => r.stopId));
  if (unique.size !== resolved.length) return fail("Остановка не может повторяться в маршруте");
  return resolved;
}

/**
 * Create a new version of a route's shape and make it current.
 * Planned trips move onto the new shape; trips that already ran keep the one
 * they followed, so the per-stop history stays truthful.
 */
async function createRouteVersion(
  routeId: string,
  stops: { stopId: string; offsetMin: number }[],
  adminId: string,
  note: string | undefined,
): Promise<{ versionId: string; version: number }> {
  const previous = await db
    .select({ version: schema.routeVersions.version })
    .from(schema.routeVersions)
    .where(eq(schema.routeVersions.routeId, routeId))
    .orderBy(desc(schema.routeVersions.version))
    .limit(1);
  const version = (previous[0]?.version ?? 0) + 1;

  const inserted = await db
    .insert(schema.routeVersions)
    .values({ routeId, version, note: note || null, createdBy: adminId })
    .returning({ id: schema.routeVersions.id });
  const versionId = inserted[0]!.id;

  await db
    .insert(schema.routeStops)
    .values(stops.map((s, i) => ({ routeId, versionId, stopId: s.stopId, seq: i + 1, offsetMin: s.offsetMin })));

  await db.update(schema.routes).set({ currentVersionId: versionId }).where(eq(schema.routes.id, routeId));

  // Trips that have not run yet will follow the new shape.
  const today = new Date().toISOString().slice(0, 10);
  await db
    .update(schema.trips)
    .set({ routeVersionId: versionId })
    .where(and(eq(schema.trips.routeId, routeId), eq(schema.trips.status, "planned"), gte(schema.trips.date, today)));

  return { versionId, version };
}

/**
 * Whether the shape changed, which is what creates a new version.
 * Shared with `describeRouteSave` on purpose: a warning computed by different
 * logic than the save it warns about is worse than no warning.
 */
function shapeDiffers(
  current: readonly { stopId: string; offsetMin: number }[],
  next: readonly { stopId: string; offsetMin: number }[],
  hasVersion: boolean,
): boolean {
  if (!hasVersion) return true;
  if (current.length !== next.length) return true;
  return current.some((s, i) => s.stopId !== next[i]!.stopId || s.offsetMin !== next[i]!.offsetMin);
}

async function currentShape(versionId: string | null): Promise<{ stopId: string; offsetMin: number }[]> {
  if (!versionId) return [];
  return db
    .select({ stopId: schema.routeStops.stopId, offsetMin: schema.routeStops.offsetMin })
    .from(schema.routeStops)
    .where(eq(schema.routeStops.versionId, versionId))
    .orderBy(asc(schema.routeStops.seq));
}

export async function saveRoute(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const data = parse(routeSchema, input);
  if (isError(data)) return failFields(data.__error, data.__fields);

  // Business rules come from the shared module, so the server enforces exactly
  // what the editor showed the administrator.
  const { errors } = validateRouteForm(routeFormInput(data));
  const firstError = Object.values(errors)[0];
  if (firstError) return failFields(firstError, errors);

  const wanted = wantedSchedules(data.departures);
  const crewClashMessage = await scheduleCrewClash(data.id, [...wanted.values()], data.daysOfWeek);
  if (crewClashMessage) return fail(crewClashMessage);

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
  let currentVersionId: string | null = null;

  if (routeId) {
    const existing = await db
      .select({ currentVersionId: schema.routes.currentVersionId })
      .from(schema.routes)
      .where(eq(schema.routes.id, routeId))
      .limit(1);
    if (!existing[0]) return fail("Маршрут не найден");
    currentVersionId = existing[0].currentVersionId;
    await db.update(schema.routes).set(values).where(eq(schema.routes.id, routeId));
  } else {
    const rows = await db.insert(schema.routes).values(values).returning({ id: schema.routes.id });
    routeId = rows[0]!.id;
    created = true;
  }

  const resolved = await resolveRouteStops(data.stops);
  if ("ok" in resolved) return resolved;

  // Compare with the current shape: a metadata-only edit must not create a version.
  const currentStops = await currentShape(currentVersionId);
  const shapeChanged = shapeDiffers(currentStops, resolved, Boolean(currentVersionId));

  let newVersion: { versionId: string; version: number } | null = null;
  if (shapeChanged) {
    newVersion = await createRouteVersion(routeId, resolved, admin.id, data.versionNote);
  }

  const existingSchedules = await db
    .select()
    .from(schema.routeSchedules)
    .where(eq(schema.routeSchedules.routeId, routeId));
  // One row per vehicle: a second bus at 07:30 is a row of its own, and taking
  // it away removes that row only.
  const toDelete = existingSchedules.filter((s) => !wanted.has(scheduleKey(s)));
  const existingKeys = new Set(existingSchedules.map(scheduleKey));
  const toInsert = [...wanted.entries()].filter(([key]) => !existingKeys.has(key)).map(([, v]) => v);

  if (toDelete.length) {
    const ids = toDelete.map((s) => s.id);
    // Standing bookings go with the departure; the passengers have to pick another one.
    await notifyDroppedSubscriptions(await dropSubscriptions({ scheduleIds: ids }), "departure");
    // Keep history: planned future trips of removed departures are cancelled.
    await db.update(schema.trips).set({ status: "cancelled" }).where(
      and(inArray(schema.trips.scheduleId, ids), eq(schema.trips.status, "planned")),
    );
    await db.delete(schema.routeSchedules).where(inArray(schema.routeSchedules.id, ids));
  }
  if (toInsert.length) {
    await db
      .insert(schema.routeSchedules)
      .values(
        toInsert.map((t) => ({
          routeId: routeId!,
          departureTime: `${t.time}:00`,
          vehicleNo: t.vehicleNo,
          driverId: t.driverId,
          vehicleId: t.vehicleId,
          daysOfWeek: data.daysOfWeek,
        })),
      );
  }
  await db
    .update(schema.routeSchedules)
    .set({ daysOfWeek: data.daysOfWeek })
    .where(eq(schema.routeSchedules.routeId, routeId));

  // A changed crew is stored on the departure and handed to its trips that
  // have nobody yet; trips crewed by hand stay as they are.
  let crewedTrips = 0;
  for (const s of existingSchedules) {
    const w = wanted.get(scheduleKey(s));
    if (!w || (w.driverId === s.driverId && w.vehicleId === s.vehicleId)) continue;
    await db
      .update(schema.routeSchedules)
      .set({ driverId: w.driverId, vehicleId: w.vehicleId })
      .where(eq(schema.routeSchedules.id, s.id));
    crewedTrips += (await applyCrewToTrips(s.id, w)).updated;
  }

  if (shapeChanged) {
    // A stop that left the route cannot be boarded at any more.
    const kept = existingSchedules.filter((s) => wanted.has(scheduleKey(s))).map((s) => s.id);
    const dropped = await dropSubscriptions({ scheduleIds: kept, keepStopIds: resolved.map((s) => s.stopId) });
    await notifyDroppedSubscriptions(dropped, "stop");
  }

  // Geometry belongs to the shape, so it is only rebuilt for a new version.
  const geometry = newVersion ? await rebuildVersionGeometry(db, newVersion.versionId) : null;

  if (!created && shapeChanged) await notifyRouteAudience(routeId, admin.id, data.name);

  refreshAdmin("/admin/routes", `/admin/routes/${routeId}`, "/app", "/app/routes", "/admin/live");

  const crewNote = crewedTrips ? `, водитель подставлен в рейсов: ${crewedTrips}` : "";
  if (!shapeChanged) {
    return { ok: true, id: routeId, message: `Маршрут обновлён, форма маршрута не изменилась${crewNote}` };
  }

  const base = created ? "Маршрут создан" : `Маршрут обновлён, создана версия ${newVersion!.version}`;
  const note =
    geometry?.source === "road"
      ? `, путь по дорогам ${(geometry.distanceM / 1000).toFixed(1).replace(".", ",")} км`
      : ", путь по дорогам построить не удалось — показаны прямые линии";
  return { ok: true, id: routeId, message: base + note + crewNote };
}

export interface SaveImpact {
  shapeChanged: boolean;
  nextVersion: number | null;
  stopCountBefore: number;
  stopCountAfter: number;
  /** departures about to disappear, and the planned trips that go with them */
  removedDepartures: string[];
  cancelledTripCount: number;
  /** planned trips that will move onto the new shape */
  movedTripCount: number;
  notifiedUserCount: number;
  /** standing bookings that lose their departure or their stop */
  droppedSubscriptionCount: number;
  /** points that will be added to the stop directory */
  newStopNames: string[];
}

/**
 * What saving this form would do, worked out before anything is written.
 *
 * Takes the same body as `saveRoute` and reuses its comparison, so the warning
 * and the action cannot drift apart. It writes nothing — in particular it does
 * not create the stops for new points, it only counts them.
 */
export async function describeRouteSave(
  input: unknown,
): Promise<{ ok: true; impact: SaveImpact } | ActionResult> {
  await requireRole("admin");
  const data = parse(routeSchema, input);
  if (isError(data)) return failFields(data.__error, data.__fields);
  if (!data.id) return fail("Маршрут ещё не сохранён");

  const existing = await db
    .select({ currentVersionId: schema.routes.currentVersionId })
    .from(schema.routes)
    .where(eq(schema.routes.id, data.id))
    .limit(1);
  if (!existing[0]) return fail("Маршрут не найден");
  const currentVersionId = existing[0].currentVersionId;

  // Points that have no stop yet keep their place in the comparison: a blank id
  // can never equal an existing one, so adding a point always counts as a change.
  const nextShape = data.stops.map((s, i) => ({ stopId: s.stopId ?? `new-${i}`, offsetMin: s.offsetMin }));
  const currentStops = await currentShape(currentVersionId);
  const shapeChanged = shapeDiffers(currentStops, nextShape, Boolean(currentVersionId));

  const latest = await db
    .select({ version: schema.routeVersions.version })
    .from(schema.routeVersions)
    .where(eq(schema.routeVersions.routeId, data.id))
    .orderBy(desc(schema.routeVersions.version))
    .limit(1);

  const today = new Date().toISOString().slice(0, 10);

  const schedules = await db
    .select({
      id: schema.routeSchedules.id,
      departureTime: schema.routeSchedules.departureTime,
      vehicleNo: schema.routeSchedules.vehicleNo,
    })
    .from(schema.routeSchedules)
    .where(eq(schema.routeSchedules.routeId, data.id));
  const wanted = wantedSchedules(data.departures);
  const removed = schedules.filter((s) => !wanted.has(scheduleKey(s)));
  const vehiclesBefore = vehiclesPerTime(schedules);

  let cancelledTripCount = 0;
  if (removed.length) {
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.trips)
      .where(
        and(
          inArray(
            schema.trips.scheduleId,
            removed.map((r) => r.id),
          ),
          eq(schema.trips.status, "planned"),
        ),
      );
    cancelledTripCount = Number(rows[0]?.n ?? 0);
  }

  let movedTripCount = 0;
  let notifiedUserCount = 0;
  if (shapeChanged) {
    const moved = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.trips)
      .where(
        and(eq(schema.trips.routeId, data.id), eq(schema.trips.status, "planned"), gte(schema.trips.date, today)),
      );
    movedTripCount = Number(moved[0]?.n ?? 0);

    const passengerRows = await db
      .selectDistinct({ userId: schema.passengerTrips.passengerId })
      .from(schema.passengerTrips)
      .innerJoin(schema.trips, eq(schema.trips.id, schema.passengerTrips.tripId))
      .where(and(eq(schema.trips.routeId, data.id), gte(schema.trips.date, today)));
    const driverRows = await db
      .selectDistinct({ userId: schema.trips.driverId })
      .from(schema.trips)
      .where(and(eq(schema.trips.routeId, data.id), gte(schema.trips.date, today)));
    notifiedUserCount = new Set(
      [...passengerRows.map((r) => r.userId), ...driverRows.map((d) => d.userId)].filter(Boolean),
    ).size;
  }

  const keptStopIds = data.stops.map((s) => s.stopId).filter((id): id is string => Boolean(id));
  const droppedSubscriptionCount =
    (await countDroppedSubscriptions({ scheduleIds: removed.map((r) => r.id) })) +
    (shapeChanged
      ? await countDroppedSubscriptions({
          scheduleIds: schedules.filter((s) => wanted.has(scheduleKey(s))).map((s) => s.id),
          keepStopIds: keptStopIds,
        })
      : 0);

  return {
    ok: true,
    impact: {
      shapeChanged,
      nextVersion: shapeChanged ? (latest[0]?.version ?? 0) + 1 : null,
      stopCountBefore: currentStops.length,
      stopCountAfter: data.stops.length,
      removedDepartures: removed
        .map((r) => departureLabel(r.departureTime, r.vehicleNo, vehiclesBefore.get(r.departureTime.slice(0, 5)) ?? 1))
        .sort(),
      cancelledTripCount,
      movedTripCount,
      notifiedUserCount,
      droppedSubscriptionCount,
      newStopNames: data.stops.filter((s) => !s.stopId).map((s) => s.name?.trim() || "Новая остановка"),
    },
  };
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

  await notify(userIds, "route_changed", {
    title: `Маршрут ${routeName} изменён`,
    body: "Проверьте остановки и расписание перед поездкой.",
    url: "/app/routes",
    tag: `route-${routeId}`,
    payload: { routeId },
  });
}

/** Tell passengers their standing booking is gone because the route changed under it. */
async function notifyDroppedSubscriptions(dropped: SubscriptionRow[], reason: "departure" | "stop"): Promise<void> {
  for (const s of dropped) {
    await notify([s.passengerId], reason === "departure" ? "schedule_changed" : "route_changed", {
      title:
        reason === "departure"
          ? `Рейс ${s.label} маршрута ${s.routeName} убран из расписания`
          : `Остановка «${s.stopName}» убрана из маршрута ${s.routeName}`,
      body: `Привязка к рейсу ${s.label} снята. Выберите другой рейс, чтобы ездить постоянно.`,
      url: `/app/routes/${s.routeId}`,
      tag: `subscription-${s.id}`,
      payload: { routeId: s.routeId },
    });
  }
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
    // The id comes from the browser: never let a driver/passenger form rewrite
    // another kind of account (an admin's phone and password, above all).
    const current = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, data.id)).limit(1);
    if (current[0]?.role !== role) return fail("Пользователь не найден");
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

/** Target account if `actor` may manage it (see canManageUser), otherwise a ready failure. */
async function getManageable(
  actor: { id: string; isSuper: boolean },
  userId: string,
): Promise<{ id: string; role: "passenger" | "driver" | "admin"; isSuper: boolean } | ActionResult> {
  const rows = await db
    .select({ id: schema.users.id, role: schema.users.role, isSuper: schema.users.isSuper })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const target = rows[0];
  if (!target) return fail("Пользователь не найден");
  if (!canManageUser(actor, target)) return fail("Недостаточно прав: администраторами управляет только суперадминистратор");
  return target;
}

export async function setUserStatus(userId: string, status: "active" | "blocked"): Promise<ActionResult> {
  const actor = await requireRole("admin");
  const target = await getManageable(actor, userId);
  if ("ok" in target) return target;
  await db.update(schema.users).set({ status }).where(eq(schema.users.id, userId));
  if (status === "blocked") {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    // Someone who can no longer sign in must not keep counting as demand.
    if (target.role === "passenger") await dropPassengerRides(userId);
  }
  refreshAdmin("/admin/drivers", "/admin/passengers", "/admin/admins");
  return { ok: true, message: status === "blocked" ? "Доступ заблокирован" : "Доступ восстановлен" };
}

// ---------------------------------------------------------------- standing bookings

const subscribeSchema = z.object({
  passengerId: z.string().uuid(),
  scheduleId: z.string().uuid("Выберите рейс"),
  stopId: z.string().uuid("Выберите остановку"),
});

/** Attach a passenger to a departure on their behalf. */
export async function adminSubscribe(input: unknown): Promise<ActionResult> {
  const admin = await requireRole("admin");
  const data = parse(subscribeSchema, input);
  if (isError(data)) return fail(data.__error);

  const result = await attachPassenger({ ...data, actorId: admin.id });
  if (!result.ok) return fail(result.error);

  const s = result.subscription;
  await notify([data.passengerId], "admin_message", {
    title: `Вас привязали к рейсу ${s.label} маршрута ${s.routeName}`,
    body: `Посадка на остановке «${s.stopName}». Отметка «Поеду» будет ставиться сама; отвязаться можно в профиле.`,
    url: `/app/routes/${s.routeId}`,
    tag: `subscription-${s.id}`,
    payload: { routeId: s.routeId },
  });
  refreshAdmin("/admin/passengers", "/admin/trips", "/app");
  return {
    ok: true,
    message: result.replaced
      ? `Привязан к рейсу ${s.label} вместо ${result.replaced.label}`
      : `Привязан к рейсу ${s.label}`,
  };
}

export async function adminUnsubscribe(subscriptionId: string): Promise<ActionResult> {
  await requireRole("admin");
  if (!z.string().uuid().safeParse(subscriptionId).success) return fail("Привязка не найдена");
  const removed = await detachSubscription(subscriptionId);
  if (!removed) return fail("Привязка не найдена");

  await notify([removed.passengerId], "admin_message", {
    title: `Привязка к рейсу ${removed.label} маршрута ${removed.routeName} снята`,
    body: "Администратор снял постоянную запись. Привязаться снова можно на странице маршрута.",
    url: `/app/routes/${removed.routeId}`,
    tag: `subscription-${removed.id}`,
    payload: { routeId: removed.routeId },
  });
  refreshAdmin("/admin/passengers", "/admin/trips", "/app");
  return { ok: true, message: "Привязка снята" };
}

// ---------------------------------------------------------------- admins

const createAdminSchema = z.object({
  name: z.string().trim().min(2, "Укажите имя"),
  phone: phoneSchema,
  password: z.string().min(6, "Пароль не короче 6 символов"),
});

/** Superadmin only. Any other admin gets a refusal, never a redirect, so the form can show it. */
async function superActor() {
  const actor = await requireRole("admin");
  return actor.isSuper ? actor : null;
}

const SUPER_ONLY = "Только суперадминистратор управляет администраторами";

export async function createAdmin(input: unknown): Promise<ActionResult> {
  if (!(await superActor())) return fail(SUPER_ONLY);
  const data = parse(createAdminSchema, input);
  if (isError(data)) return fail(data.__error);
  try {
    await db.insert(schema.users).values({
      name: data.name,
      phone: data.phone,
      role: "admin",
      passwordHash: await hashPassword(data.password),
    });
  } catch {
    return fail("Пользователь с таким телефоном уже существует");
  }
  refreshAdmin("/admin/admins");
  return { ok: true, message: "Администратор добавлен" };
}

const resetAdminPasswordSchema = z.object({
  id: z.string().uuid(),
  password: z.string().min(6, "Пароль не короче 6 символов"),
});

/** Set a new password for another admin and sign them out everywhere. */
export async function resetAdminPassword(input: unknown): Promise<ActionResult> {
  const actor = await superActor();
  if (!actor) return fail(SUPER_ONLY);
  const data = parse(resetAdminPasswordSchema, input);
  if (isError(data)) return fail(data.__error);
  const target = await getManageable(actor, data.id);
  if ("ok" in target) return target;
  if (target.role !== "admin") return fail("Пользователь не найден");

  await db.update(schema.users).set({ passwordHash: await hashPassword(data.password) }).where(eq(schema.users.id, data.id));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, data.id));
  refreshAdmin("/admin/admins");
  return { ok: true, message: "Пароль изменён, администратор должен войти заново" };
}

// ---------------------------------------------------------------- trips

const generateSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  routeId: z.string().uuid().optional().or(z.literal("")),
});

/**
 * Create trips from active schedules for a date range: one trip per vehicle
 * departure per day. The crew is the one set on the departure; whatever it
 * leaves open is copied from the most recent trip of the same vehicle
 * departure. A departure with no history yet borrows the route's last crew
 * only when it is the only vehicle at its time; with several it stays
 * unassigned, so one driver is never put on two buses at once.
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
      vehicleNo: schema.routeSchedules.vehicleNo,
      driverId: schema.routeSchedules.driverId,
      vehicleId: schema.routeSchedules.vehicleId,
      daysOfWeek: schema.routeSchedules.daysOfWeek,
      active: schema.routeSchedules.active,
    })
    .from(schema.routeSchedules)
    .innerJoin(schema.routes, eq(schema.routes.id, schema.routeSchedules.routeId))
    .where(and(routeFilter, eq(schema.routes.status, "active"), eq(schema.routeSchedules.active, true)));
  if (!schedules.length) return fail("Нет активных расписаний для генерации");

  const routeIds = [...new Set(schedules.map((s) => s.routeId))];
  const lastAssignments = await db
    .select({
      routeId: schema.trips.routeId,
      scheduleId: schema.trips.scheduleId,
      vehicleId: schema.trips.vehicleId,
      driverId: schema.trips.driverId,
    })
    .from(schema.trips)
    .where(inArray(schema.trips.routeId, routeIds))
    .orderBy(desc(schema.trips.date));
  const bySchedule = new Map<string, Crew>();
  const byRoute = new Map<string, Crew>();
  for (const a of lastAssignments) {
    if (a.scheduleId && !bySchedule.has(a.scheduleId)) bySchedule.set(a.scheduleId, a);
    if (!byRoute.has(a.routeId)) byRoute.set(a.routeId, a);
  }
  const vehiclesAt = new Map<string, number>();
  for (const s of schedules) {
    const key = `${s.routeId}|${s.departureTime}`;
    vehiclesAt.set(key, (vehiclesAt.get(key) ?? 0) + 1);
  }

  const existing = await db
    .select({
      routeId: schema.trips.routeId,
      scheduleId: schema.trips.scheduleId,
      date: schema.trips.date,
      startTime: schema.trips.startTime,
      status: schema.trips.status,
    })
    .from(schema.trips)
    .where(and(inArray(schema.trips.routeId, routeIds), gte(schema.trips.date, data.from), lte(schema.trips.date, data.to)));
  // A trip made from a schedule is keyed by it. A trip that lost its schedule
  // (the vehicle was taken off) still occupies its time while it runs, but a
  // cancelled one must not stop the vehicle from being added back.
  const seen = new Set(
    existing
      .filter((e) => e.scheduleId || e.status !== "cancelled")
      .map((e) => (e.scheduleId ? `${e.scheduleId}|${e.date}` : `${e.routeId}|${e.date}|${e.startTime}`)),
  );

  const rows: (typeof schema.trips.$inferInsert)[] = [];
  for (let d = 0; d <= days; d++) {
    const date = addDays(data.from, d);
    const weekday = weekdayOfDate(date);
    for (const s of schedules) {
      if (!s.daysOfWeek.includes(weekday)) continue;
      if (seen.has(`${s.scheduleId}|${date}`) || seen.has(`${s.routeId}|${date}|${s.departureTime}`)) continue;
      const alone = (vehiclesAt.get(`${s.routeId}|${s.departureTime}`) ?? 1) === 1;
      const a = bySchedule.get(s.scheduleId) ?? (alone ? byRoute.get(s.routeId) : undefined);
      rows.push({
        routeId: s.routeId,
        scheduleId: s.scheduleId,
        vehicleNo: s.vehicleNo,
        vehicleId: s.vehicleId ?? a?.vehicleId ?? null,
        driverId: s.driverId ?? a?.driverId ?? null,
        date,
        startTime: s.departureTime,
        status: "planned",
      });
    }
  }

  if (!rows.length) return { ok: true, message: "Все рейсы на этот период уже созданы" };
  await db.insert(schema.trips).values(rows).onConflictDoNothing();
  // Passengers with a standing booking are booked on the new trips straight away.
  const booked = await bookSubscribers([...new Set(rows.map((r) => r.scheduleId!))]);
  refreshAdmin("/admin/trips", "/app");
  return {
    ok: true,
    message: booked ? `Создано рейсов: ${rows.length}, записей постоянных пассажиров: ${booked}` : `Создано рейсов: ${rows.length}`,
  };
}

/**
 * Another trip leaving at the same moment that already has this driver or this
 * vehicle: with two buses on one departure it is easy to pick the same person twice.
 */
async function crewClash(
  trip: { id: string; date: string; startTime: string },
  column: typeof schema.trips.driverId | typeof schema.trips.vehicleId,
  value: string,
): Promise<{ routeName: string; startTime: string } | null> {
  const rows = await db
    .select({ routeName: schema.routes.name, startTime: schema.trips.startTime })
    .from(schema.trips)
    .innerJoin(schema.routes, eq(schema.routes.id, schema.trips.routeId))
    .where(
      and(
        eq(schema.trips.date, trip.date),
        eq(schema.trips.startTime, trip.startTime),
        ne(schema.trips.id, trip.id),
        ne(schema.trips.status, "cancelled"),
        eq(column, value),
      ),
    )
    .limit(1);
  return rows[0] ? { routeName: rows[0].routeName, startTime: rows[0].startTime.slice(0, 5) } : null;
}

/**
 * Make this crew the departure's own and put it on this trip and every planned
 * trip of the same departure after it, replacing whoever was there. Trips where
 * the person or vehicle is busy on another bus at that moment are skipped and
 * counted, so the administrator knows to look at them.
 */
export async function assignDeparture(tripId: string, vehicleId: string | null, driverId: string | null): Promise<ActionResult> {
  await requireRole("admin");
  const trip = (
    await db
      .select({ scheduleId: schema.trips.scheduleId, date: schema.trips.date })
      .from(schema.trips)
      .where(eq(schema.trips.id, tripId))
      .limit(1)
  )[0];
  if (!trip) return fail("Рейс не найден");
  if (!trip.scheduleId) return fail("Рейс не связан с расписанием — назначьте его отдельно");

  const crew = { vehicleId: vehicleId || null, driverId: driverId || null };
  const schedule = (
    await db
      .select({
        routeId: schema.routeSchedules.routeId,
        departureTime: schema.routeSchedules.departureTime,
        vehicleNo: schema.routeSchedules.vehicleNo,
        daysOfWeek: schema.routeSchedules.daysOfWeek,
      })
      .from(schema.routeSchedules)
      .where(eq(schema.routeSchedules.id, trip.scheduleId))
      .limit(1)
  )[0];
  if (!schedule) return fail("Отправление больше не в расписании — назначьте рейс отдельно");

  const time = schedule.departureTime.slice(0, 5);
  const clash = await scheduleCrewClash(
    schedule.routeId,
    [{ time, vehicleNo: schedule.vehicleNo, ...crew }],
    schedule.daysOfWeek,
  );
  if (clash) return fail(clash);
  const sameRoute = await db
    .select({ id: schema.routeSchedules.id })
    .from(schema.routeSchedules)
    .where(
      and(
        eq(schema.routeSchedules.routeId, schedule.routeId),
        eq(schema.routeSchedules.departureTime, schedule.departureTime),
        ne(schema.routeSchedules.id, trip.scheduleId),
        crew.driverId && crew.vehicleId
          ? or(eq(schema.routeSchedules.driverId, crew.driverId), eq(schema.routeSchedules.vehicleId, crew.vehicleId))
          : crew.driverId
            ? eq(schema.routeSchedules.driverId, crew.driverId)
            : crew.vehicleId
              ? eq(schema.routeSchedules.vehicleId, crew.vehicleId)
              : sql`false`,
      ),
    )
    .limit(1);
  if (sameRoute[0]) return fail(`В ${time} этот водитель или транспорт уже закреплён за другой машиной маршрута`);

  await db.update(schema.routeSchedules).set(crew).where(eq(schema.routeSchedules.id, trip.scheduleId));
  const { updated, skipped } = await applyCrewToTrips(trip.scheduleId, crew, { fromDate: trip.date, overwrite: true });
  refreshAdmin("/admin/trips", "/admin/routes", `/admin/routes/${schedule.routeId}`, "/driver");

  const parts = [`Закреплено за отправлением ${time}`, `обновлено рейсов: ${updated}`];
  if (skipped) parts.push(`пропущено из-за занятости в это время: ${skipped}`);
  return { ok: true, message: parts.join(", ") };
}

export async function assignTrip(tripId: string, vehicleId: string | null, driverId: string | null): Promise<ActionResult> {
  await requireRole("admin");
  const trip = (
    await db
      .select({ id: schema.trips.id, date: schema.trips.date, startTime: schema.trips.startTime })
      .from(schema.trips)
      .where(eq(schema.trips.id, tripId))
      .limit(1)
  )[0];
  if (!trip) return fail("Рейс не найден");
  if (driverId) {
    const clash = await crewClash(trip, schema.trips.driverId, driverId);
    if (clash) return fail(`Этот водитель уже ведёт рейс ${clash.routeName} в ${clash.startTime}`);
  }
  if (vehicleId) {
    const clash = await crewClash(trip, schema.trips.vehicleId, vehicleId);
    if (clash) return fail(`Этот транспорт уже стоит на рейсе ${clash.routeName} в ${clash.startTime}`);
  }
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
    .select({
      routeId: schema.trips.routeId,
      date: schema.trips.date,
      startTime: schema.trips.startTime,
      vehicleNo: tripVehicleNo,
      vehiclesAtTime: tripVehiclesAtTime,
      driverId: schema.trips.driverId,
    })
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
    await notify(recipients, "trip_cancelled", {
      title: `Рейс ${tripLabel(trip)} отменён`,
      body: `Маршрут ${routeRows[0]?.name ?? ""} на ${trip.date}. Выберите другой рейс.`,
      url: "/app",
      tag: `trip-cancel-${tripId}`,
      payload: { tripId },
    });
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

  await notify(userIds, "admin_message", {
    title: data.title,
    body: data.body,
    url: "/app/notifications",
    payload: data.routeId ? { routeId: data.routeId } : {},
  });
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

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: z.string().min(6, "Пароль не короче 6 символов"),
});

export async function changeMyPassword(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(changePasswordSchema, input);
  if (isError(data)) return fail(data.__error);
  const result = await changeOwnPassword(data.currentPassword, data.newPassword);
  return result.ok ? { ok: true, message: "Пароль изменён" } : fail(result.error);
}

export async function updateThresholds(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(thresholdSchema, input);
  if (isError(data)) return fail(data.__error);
  if (data.lowAvgPct >= data.overloadAvgPct) return fail("Порог низкой загрузки должен быть меньше порога перегрузки");
  await saveThresholds(data as LoadThresholds);
  refreshAdmin("/admin/settings", "/admin/analytics");
  return { ok: true, message: "Пороги сохранены" };
}

const liveSchema = z.object({
  offRouteM: z.coerce.number().int().min(50).max(5000),
  consecutive: z.coerce.number().int().min(1).max(20),
  missingAfterMin: z.coerce.number().int().min(1).max(120),
  approachMin: z.coerce.number().int().min(1).max(30),
});

/** Thresholds for deviation, lost tracking and the "approaching" notice. */
export async function updateLiveSettings(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(liveSchema, input);
  if (isError(data)) return fail(data.__error);
  await saveDeviationSettings(data);
  refreshAdmin("/admin/settings", "/admin/live");
  return { ok: true, message: "Настройки мониторинга сохранены" };
}

// ---------------------------------------------------------------- planning

const proposalSchema = z.object({
  name: z.string().trim().min(1, "Укажите номер маршрута"),
  description: z.string().trim().optional(),
  direction: z.enum(["to_work", "from_work"]).default("to_work"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c3aed"),
  departures: z.array(z.string().regex(/^\d{2}:\d{2}$/)).default([]),
  daysOfWeek: z.array(z.coerce.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
  stops: z
    .array(
      z.object({
        stopId: z.string().uuid().nullable(),
        name: z.string().trim().min(2),
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        offsetMin: z.coerce.number().int().min(0).max(600),
      }),
    )
    .min(2, "В маршруте должно быть минимум две остановки"),
});

/**
 * Turn a proposal into a draft route: missing stops are created, the route is
 * saved as a draft so nothing reaches passengers until an administrator
 * reviews it and switches it to active.
 */
export async function createRouteDraft(input: unknown): Promise<ActionResult> {
  // Authorise before the first write: resolving stops already inserts rows.
  const admin = await requireRole("admin");
  const data = parse(proposalSchema, input);
  if (isError(data)) return fail(data.__error);

  const resolved: { stopId: string; offsetMin: number }[] = [];
  for (const stop of data.stops) {
    if (stop.stopId) {
      resolved.push({ stopId: stop.stopId, offsetMin: stop.offsetMin });
      continue;
    }
    const created = await db
      .insert(schema.stops)
      .values({ name: stop.name, lat: stop.lat, lng: stop.lng, status: "active" })
      .returning({ id: schema.stops.id });
    resolved.push({ stopId: created[0]!.id, offsetMin: stop.offsetMin });
  }

  const route = await db
    .insert(schema.routes)
    .values({
      name: data.name,
      description: data.description || null,
      direction: data.direction,
      status: "draft",
      color: data.color,
    })
    .returning({ id: schema.routes.id });
  const routeId = route[0]!.id;

  const version = await createRouteVersion(routeId, resolved, admin.id, "Создан из предложения системы");

  if (data.departures.length) {
    await db
      .insert(schema.routeSchedules)
      .values(data.departures.map((t) => ({ routeId, departureTime: `${t}:00`, daysOfWeek: data.daysOfWeek })));
  }

  await rebuildVersionGeometry(db, version.versionId);

  refreshAdmin("/admin/routes", "/admin/stops", "/admin/planning");
  return { ok: true, id: routeId, message: "Черновик маршрута создан. Проверьте и активируйте его." };
}

const departureSchema = z.object({
  routeId: z.string().uuid(),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/, "Время в формате ЧЧ:ММ"),
  daysOfWeek: z.array(z.coerce.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
});

/** Add one departure to an existing route, keeping everything else untouched. */
export async function addDeparture(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
  const data = parse(departureSchema, input);
  if (isError(data)) return fail(data.__error);

  const existing = await db
    .select({ id: schema.routeSchedules.id })
    .from(schema.routeSchedules)
    .where(
      and(
        eq(schema.routeSchedules.routeId, data.routeId),
        eq(schema.routeSchedules.departureTime, `${data.departureTime}:00`),
      ),
    )
    .limit(1);
  if (existing[0]) return fail("Такое отправление уже есть");

  await db.insert(schema.routeSchedules).values({
    routeId: data.routeId,
    departureTime: `${data.departureTime}:00`,
    daysOfWeek: data.daysOfWeek,
  });

  refreshAdmin("/admin/routes", `/admin/routes/${data.routeId}`, "/admin/planning", "/app/routes");
  return { ok: true, message: `Отправление ${data.departureTime} добавлено. Не забудьте сгенерировать рейсы.` };
}

/**
 * Rebuild road geometry for every route.
 * Used after the routing provider was unavailable, or when stops moved.
 */
export async function rebuildGeometry(): Promise<ActionResult> {
  await requireRole("admin");
  const results = await rebuildAllRouteGeometry(db);
  if (results.length === 0) return fail("Нет маршрутов для построения");

  const road = results.filter((r) => r.source === "road").length;
  const straight = results.length - road;
  refreshAdmin("/admin/routes", "/admin/live", "/app", "/app/routes");

  return {
    ok: true,
    message:
      straight === 0
        ? `Построено по дорогам: ${road} маршрутов`
        : `Построено по дорогам: ${road}, осталось на прямых линиях: ${straight}`,
  };
}
