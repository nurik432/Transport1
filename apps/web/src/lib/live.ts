import "server-only";
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import {
  DEFAULT_DEVIATION,
  DEFAULT_TRACKING,
  etaOnPath,
  formatEta,
  isDeviating,
  isTrackingMissing,
  localDateTime,
  parseTimeToMinutes,
  plannedSpeedOnPath,
  preparePath,
  projectOnPath,
  shouldAlertApproaching,
  trackingState,
  type DeviationSettings,
  type LiveEta,
  type PathStop,
  type RoutePath,
  type TrackingState,
} from "@transport/domain";
import { db, schema } from "./db";
import { notify } from "./push";

const { trips, routes, routeVersions, routeStops, stops, vehicles, vehiclePositions, passengerTrips, tripStopEvents, tripStopAlerts, settings } =
  schema;

export async function getDeviationSettings(): Promise<DeviationSettings> {
  const row = await db.select().from(settings).where(eq(settings.key, "live_settings")).limit(1);
  const value = row[0]?.value as Partial<DeviationSettings> | undefined;
  return { ...DEFAULT_DEVIATION, ...(value ?? {}) };
}

export async function saveDeviationSettings(next: DeviationSettings): Promise<void> {
  await db
    .insert(settings)
    .values({ key: "live_settings", value: next as unknown as Record<string, unknown>, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: next as unknown as Record<string, unknown>, updatedAt: new Date() },
    });
}

/**
 * The route's shape with its stops located on it.
 * Uses the stored road geometry when it exists, otherwise straight lines
 * between stops, so live estimates work even before geometry is built.
 */
async function routePath(versionId: string): Promise<RoutePath | null> {
  const [versionRow, stopRows] = await Promise.all([
    db.select({ path: routeVersions.path }).from(routeVersions).where(eq(routeVersions.id, versionId)).limit(1),
    db
      .select({
        stopId: routeStops.stopId,
        seq: routeStops.seq,
        offsetMin: routeStops.offsetMin,
        roadDistanceM: routeStops.roadDistanceM,
        lat: stops.lat,
        lng: stops.lng,
      })
      .from(routeStops)
      .innerJoin(stops, eq(stops.id, routeStops.stopId))
      .where(eq(routeStops.versionId, versionId))
      .orderBy(asc(routeStops.seq)),
  ]);

  if (stopRows.length < 2) return null;

  const stored = versionRow[0]?.path;
  const hasRoadGeometry = Array.isArray(stored) && stored.length >= 2;
  const points = hasRoadGeometry
    ? stored.map(([lat, lng]) => ({ lat, lng }))
    : stopRows.map((s) => ({ lat: s.lat, lng: s.lng }));

  return preparePath(
    points,
    stopRows.map((s) => ({
      stopId: s.stopId,
      seq: s.seq,
      offsetMin: s.offsetMin,
      lat: s.lat,
      lng: s.lng,
      distanceM: hasRoadGeometry ? s.roadDistanceM : null,
    })),
  );
}

export interface RecordPositionInput {
  tripId: string;
  driverId: string;
  lat: number;
  lng: number;
  speedKph?: number | null;
  headingDeg?: number | null;
  accuracyM?: number | null;
  recordedAt?: Date;
}

export interface RecordPositionResult {
  ok: boolean;
  error?: string;
  offRouteM?: number | null;
  alerted?: number;
}

/**
 * Store one GPS sample of a running trip and notify passengers whose stop is close.
 * Positions are only accepted for the driver's own trip while it is in progress,
 * so tracking stops the moment the trip ends.
 */
export async function recordPosition(input: RecordPositionInput): Promise<RecordPositionResult> {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return { ok: false, error: "Некорректные координаты" };
  if (Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) return { ok: false, error: "Координаты вне диапазона" };

  const tripRows = await db
    .select({
      id: trips.id,
      routeId: trips.routeId,
      versionId: sql<string>`coalesce(${trips.routeVersionId}, ${routes.currentVersionId})`,
      vehicleId: trips.vehicleId,
      driverId: trips.driverId,
      status: trips.status,
    })
    .from(trips)
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .where(eq(trips.id, input.tripId))
    .limit(1);
  const trip = tripRows[0];
  if (!trip || trip.driverId !== input.driverId) return { ok: false, error: "Рейс не найден" };
  if (trip.status !== "in_progress") return { ok: false, error: "Рейс не в пути" };

  const path = trip.versionId ? await routePath(trip.versionId) : null;
  const projection = path ? projectOnPath({ lat: input.lat, lng: input.lng }, path) : null;
  const recordedAt = input.recordedAt ?? new Date();

  await db.insert(vehiclePositions).values({
    tripId: trip.id,
    vehicleId: trip.vehicleId,
    driverId: trip.driverId,
    lat: input.lat,
    lng: input.lng,
    offRouteM: projection ? Math.round(projection.offRouteM) : null,
    speedKph: input.speedKph ?? null,
    headingDeg: input.headingDeg ?? null,
    accuracyM: input.accuracyM ?? null,
    recordedAt,
  });

  const alerted = path
    ? await alertApproachingPassengers({
        tripId: trip.id,
        routeId: trip.routeId,
        path,
        projection,
        position: { lat: input.lat, lng: input.lng, recordedAt, speedKph: input.speedKph ?? null },
        now: recordedAt,
      })
    : 0;

  return { ok: true, offRouteM: projection ? Math.round(projection.offRouteM) : null, alerted };
}

/** Send "the bus is close" to passengers whose boarding stop is within the alert window. */
async function alertApproachingPassengers(args: {
  tripId: string;
  routeId: string;
  path: RoutePath;
  projection: ReturnType<typeof projectOnPath>;
  position: { lat: number; lng: number; recordedAt: Date; speedKph: number | null };
  now: Date;
}): Promise<number> {
  const settingsValue = await getDeviationSettings();

  const [waiting, passed, route] = await Promise.all([
    db
      .select({ userId: passengerTrips.passengerId, stopId: passengerTrips.stopId, stopName: stops.name })
      .from(passengerTrips)
      .innerJoin(stops, eq(stops.id, passengerTrips.stopId))
      .where(and(eq(passengerTrips.tripId, args.tripId), ne(passengerTrips.status, "cancelled"))),
    db.select({ stopId: tripStopEvents.stopId }).from(tripStopEvents).where(eq(tripStopEvents.tripId, args.tripId)),
    db.select({ name: routes.name }).from(routes).where(eq(routes.id, args.routeId)).limit(1),
  ]);
  if (!waiting.length) return 0;

  const passedStops = new Set(passed.map((p) => p.stopId));
  const already = await db
    .select({ stopId: tripStopAlerts.stopId, userId: tripStopAlerts.userId })
    .from(tripStopAlerts)
    .where(and(eq(tripStopAlerts.tripId, args.tripId), eq(tripStopAlerts.kind, "approaching")));
  const alertedPairs = new Set(already.map((a) => `${a.userId}:${a.stopId}`));

  const fallbackSpeed = plannedSpeedOnPath(args.path);
  const etaByStop = new Map<string, LiveEta | null>();

  const pending: { userId: string; stopId: string; stopName: string; eta: LiveEta }[] = [];
  for (const w of waiting) {
    if (passedStops.has(w.stopId)) continue;
    if (alertedPairs.has(`${w.userId}:${w.stopId}`)) continue;

    if (!etaByStop.has(w.stopId)) {
      etaByStop.set(
        w.stopId,
        etaOnPath({
          position: args.position,
          path: args.path,
          projection: args.projection,
          targetStopId: w.stopId,
          now: args.now,
          fallbackSpeedKph: fallbackSpeed,
        }),
      );
    }
    const eta = etaByStop.get(w.stopId);
    if (eta && shouldAlertApproaching(eta, settingsValue)) pending.push({ ...w, eta });
  }
  if (!pending.length) return 0;

  await db
    .insert(tripStopAlerts)
    .values(pending.map((p) => ({ tripId: args.tripId, stopId: p.stopId, userId: p.userId, kind: "approaching" })))
    .onConflictDoNothing();

  const routeName = route[0]?.name ?? "";
  // Group by stop so every passenger at the same stop gets one identical message.
  const byStop = new Map<string, { stopName: string; eta: LiveEta; users: string[] }>();
  for (const p of pending) {
    const entry = byStop.get(p.stopId);
    if (entry) entry.users.push(p.userId);
    else byStop.set(p.stopId, { stopName: p.stopName, eta: p.eta, users: [p.userId] });
  }

  for (const [stopId, entry] of byStop) {
    await notify(entry.users, "vehicle_approaching", {
      title: `Маршрут ${routeName} подъезжает`,
      body: `Остановка «${entry.stopName}» — ${formatEta(entry.eta)}.`,
      url: `/app/trips/${args.tripId}`,
      tag: `approach-${args.tripId}-${stopId}`,
      payload: { tripId: args.tripId, stopId },
    });
  }

  return pending.length;
}

export interface LiveVehicle {
  tripId: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  direction: "to_work" | "from_work";
  startTime: string;
  vehicleNumber: string | null;
  driverName: string | null;
  lat: number;
  lng: number;
  speedKph: number | null;
  offRouteM: number | null;
  recordedAt: Date;
  tracking: TrackingState;
  bookedTotal: number;
  /** Seats in the assigned vehicle, null when none is assigned. */
  capacity: number | null;
  /** Where the vehicle is heading next, and when it gets there. */
  nextStopName: string | null;
  nextStopEtaMin: number | null;
  /** Minutes behind the timetable at that stop; negative means early. */
  delayMin: number | null;
}

/**
 * Latest position of every trip that is running right now, with the one thing
 * the monitoring list is read for: which stop is next and whether it is late.
 */
export async function getLiveVehicles(now = new Date()): Promise<LiveVehicle[]> {
  const rows = await db
    .select({
      tripId: trips.id,
      routeId: routes.id,
      routeName: routes.name,
      routeColor: routes.color,
      direction: routes.direction,
      date: trips.date,
      startTime: trips.startTime,
      versionId: sql<string | null>`coalesce(${trips.routeVersionId}, ${routes.currentVersionId})`,
      vehicleNumber: vehicles.number,
      capacity: vehicles.capacity,
      driverName: schema.users.name,
      lat: vehiclePositions.lat,
      lng: vehiclePositions.lng,
      speedKph: vehiclePositions.speedKph,
      offRouteM: vehiclePositions.offRouteM,
      recordedAt: vehiclePositions.recordedAt,
      bookedTotal: sql<number>`(select count(*) from ${passengerTrips} pt where pt.trip_id = ${trips.id} and pt.status <> 'cancelled')`,
    })
    .from(trips)
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(schema.users, eq(schema.users.id, trips.driverId))
    .innerJoin(
      vehiclePositions,
      and(
        eq(vehiclePositions.tripId, trips.id),
        eq(
          vehiclePositions.recordedAt,
          sql`(select max(vp.recorded_at) from ${vehiclePositions} vp where vp.trip_id = ${trips.id})`,
        ),
      ),
    )
    .where(eq(trips.status, "in_progress"));

  if (!rows.length) return [];

  // Routes repeat between trips, so each shape is built once.
  const pathCache = new Map<string, RoutePath | null>();
  const pathOf = async (versionId: string | null): Promise<RoutePath | null> => {
    if (!versionId) return null;
    if (!pathCache.has(versionId)) pathCache.set(versionId, await routePath(versionId));
    return pathCache.get(versionId) ?? null;
  };

  const stopsDone = await db
    .select({ tripId: tripStopEvents.tripId, stopId: tripStopEvents.stopId })
    .from(tripStopEvents)
    .where(inArray(tripStopEvents.tripId, rows.map((r) => r.tripId)));
  const doneByTrip = new Map<string, Set<string>>();
  for (const e of stopsDone) {
    const set = doneByTrip.get(e.tripId);
    if (set) set.add(e.stopId);
    else doneByTrip.set(e.tripId, new Set([e.stopId]));
  }

  const out: LiveVehicle[] = [];
  const nextStopIds = new Set<string>();
  const pending: { row: (typeof rows)[number]; next: PathStop | null; eta: LiveEta | null }[] = [];

  for (const r of rows) {
    const path = await pathOf(r.versionId);
    let next: PathStop | null = null;
    let eta: LiveEta | null = null;

    if (path) {
      const position = { lat: r.lat, lng: r.lng, recordedAt: r.recordedAt, speedKph: r.speedKph };
      const projection = projectOnPath(position, path);
      const fallbackSpeed = plannedSpeedOnPath(path);
      const done = doneByTrip.get(r.tripId) ?? new Set<string>();
      for (const stop of [...path.stops].sort((a, b) => a.seq - b.seq)) {
        if (done.has(stop.stopId)) continue;
        const candidate = etaOnPath({
          position,
          path,
          projection,
          targetStopId: stop.stopId,
          now,
          fallbackSpeedKph: fallbackSpeed,
        });
        if (!candidate || candidate.passed) continue;
        next = stop;
        eta = candidate;
        break;
      }
      if (next) nextStopIds.add(next.stopId);
    }
    pending.push({ row: r, next, eta });
  }

  const names = nextStopIds.size
    ? await db.select({ id: stops.id, name: stops.name }).from(stops).where(inArray(stops.id, [...nextStopIds]))
    : [];
  const nameById = new Map(names.map((s) => [s.id, s.name]));

  for (const { row: r, next, eta } of pending) {
    // Scheduled arrival at that stop: departure plus the stop offset.
    const plannedAt =
      next === null ? null : localDateTime(r.date, parseTimeToMinutes(r.startTime.slice(0, 5)) + next.offsetMin);
    out.push({
      tripId: r.tripId,
      routeId: r.routeId,
      routeName: r.routeName,
      routeColor: r.routeColor,
      direction: r.direction,
      startTime: r.startTime.slice(0, 5),
      vehicleNumber: r.vehicleNumber,
      capacity: r.capacity ?? null,
      driverName: r.driverName,
      lat: r.lat,
      lng: r.lng,
      speedKph: r.speedKph,
      offRouteM: r.offRouteM,
      recordedAt: r.recordedAt,
      tracking: trackingState(r.recordedAt, now, DEFAULT_TRACKING),
      bookedTotal: Number(r.bookedTotal),
      nextStopName: next ? (nameById.get(next.stopId) ?? null) : null,
      nextStopEtaMin: eta ? eta.minutesFromNow : null,
      delayMin: eta && plannedAt ? Math.round((eta.arrivalAt.getTime() - plannedAt.getTime()) / 60_000) : null,
    });
  }

  return out;
}

export interface TripLive {
  position: { lat: number; lng: number; recordedAt: Date; speedKph: number | null; offRouteM: number | null } | null;
  tracking: TrackingState;
  /** live ETA per stop id, present only while a fresh position exists */
  etaByStop: Record<string, { minutesFromNow: number; distanceM: number; passed: boolean; arrivalAt: string }>;
}

/** Live state of one trip: last position and per-stop arrival estimates. */
export async function getTripLive(tripId: string, now = new Date()): Promise<TripLive> {
  const rows = await db
    .select({
      lat: vehiclePositions.lat,
      lng: vehiclePositions.lng,
      speedKph: vehiclePositions.speedKph,
      offRouteM: vehiclePositions.offRouteM,
      recordedAt: vehiclePositions.recordedAt,
      versionId: sql<string>`coalesce(${trips.routeVersionId}, ${routes.currentVersionId})`,
    })
    .from(vehiclePositions)
    .innerJoin(trips, eq(trips.id, vehiclePositions.tripId))
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .where(eq(vehiclePositions.tripId, tripId))
    .orderBy(desc(vehiclePositions.recordedAt))
    .limit(1);

  const last = rows[0];
  const tracking = trackingState(last?.recordedAt ?? null, now);
  if (!last || tracking === "lost") {
    return { position: last ? { ...last, offRouteM: last.offRouteM } : null, tracking, etaByStop: {} };
  }

  const path = last.versionId ? await routePath(last.versionId) : null;
  if (!path) {
    return {
      position: { lat: last.lat, lng: last.lng, recordedAt: last.recordedAt, speedKph: last.speedKph, offRouteM: last.offRouteM },
      tracking,
      etaByStop: {},
    };
  }

  const position = { lat: last.lat, lng: last.lng, recordedAt: last.recordedAt, speedKph: last.speedKph };
  const fallbackSpeed = plannedSpeedOnPath(path);
  // One projection is enough: it does not depend on which stop we ask about.
  const projection = projectOnPath(position, path);
  const etaByStop: TripLive["etaByStop"] = {};
  for (const p of path.stops) {
    const eta = etaOnPath({
      position,
      path,
      projection,
      targetStopId: p.stopId,
      now,
      fallbackSpeedKph: fallbackSpeed,
    });
    if (eta) {
      etaByStop[p.stopId] = {
        minutesFromNow: eta.minutesFromNow,
        distanceM: eta.distanceM,
        passed: eta.passed,
        arrivalAt: eta.arrivalAt.toISOString(),
      };
    }
  }

  return {
    position: { lat: last.lat, lng: last.lng, recordedAt: last.recordedAt, speedKph: last.speedKph, offRouteM: last.offRouteM },
    tracking,
    etaByStop,
  };
}

/** The trail of a running trip, for drawing where the vehicle has been. */
export async function getTripTrail(tripId: string, limit = 120) {
  const rows = await db
    .select({ lat: vehiclePositions.lat, lng: vehiclePositions.lng, recordedAt: vehiclePositions.recordedAt })
    .from(vehiclePositions)
    .where(eq(vehiclePositions.tripId, tripId))
    .orderBy(desc(vehiclePositions.recordedAt))
    .limit(limit);
  return rows.reverse();
}

export type LiveSignalKind = "off_route" | "no_tracking" | "not_started";

export interface LiveSignal {
  kind: LiveSignalKind;
  tripId: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  startTime: string;
  driverName: string | null;
  /** Phone of the assigned driver, so the card can offer to call. */
  driverPhone: string | null;
  vehicleNumber: string | null;
  /** Passengers who booked this trip. */
  booked: number;
  /** Minutes since the trip should have departed; only for "not_started". */
  lateMin: number | null;
  /** Distance from the route line in metres; only for "off_route". */
  offRouteM: number | null;
  /** Seconds since the last GPS point, null when there is none. */
  silentSec: number | null;
  title: string;
  details: string;
}

/**
 * Operational signals computed on read: vehicles off their route, running trips
 * that stopped reporting, and trips that should have departed but never started.
 */
export async function getLiveSignals(now = new Date(), today?: string): Promise<LiveSignal[]> {
  const settingsValue = await getDeviationSettings();
  const date = today ?? new Date().toISOString().slice(0, 10);

  const active = await db
    .select({
      tripId: trips.id,
      routeId: routes.id,
      routeName: routes.name,
      routeColor: routes.color,
      startTime: trips.startTime,
      status: trips.status,
      startedAt: trips.startedAt,
      driverName: schema.users.name,
      driverPhone: schema.users.phone,
      vehicleNumber: vehicles.number,
      booked: sql<number>`(select count(*) from ${passengerTrips} pt where pt.trip_id = ${trips.id} and pt.status <> 'cancelled')`,
    })
    .from(trips)
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(schema.users, eq(schema.users.id, trips.driverId))
    .where(and(eq(trips.date, date), inArray(trips.status, ["planned", "in_progress"])));
  if (!active.length) return [];

  const ids = active.map((a) => a.tripId);
  const recent = await db
    .select({
      tripId: vehiclePositions.tripId,
      offRouteM: vehiclePositions.offRouteM,
      recordedAt: vehiclePositions.recordedAt,
    })
    .from(vehiclePositions)
    .where(and(inArray(vehiclePositions.tripId, ids), gte(vehiclePositions.recordedAt, new Date(now.getTime() - 60 * 60_000))))
    .orderBy(asc(vehiclePositions.recordedAt));

  const byTrip = new Map<string, { offRouteM: number | null; recordedAt: Date }[]>();
  for (const r of recent) {
    const list = byTrip.get(r.tripId);
    if (list) list.push(r);
    else byTrip.set(r.tripId, [r]);
  }

  const signals: LiveSignal[] = [];
  for (const t of active) {
    const trail = byTrip.get(t.tripId) ?? [];
    const lastAt = trail.at(-1)?.recordedAt ?? null;
    const time = t.startTime.slice(0, 5);
    const who = [t.routeName, time].join(" · ");
    const silentSec = lastAt ? Math.round((now.getTime() - lastAt.getTime()) / 1000) : null;
    const common = {
      tripId: t.tripId,
      routeId: t.routeId,
      routeName: t.routeName,
      routeColor: t.routeColor,
      startTime: time,
      driverName: t.driverName,
      driverPhone: t.driverPhone,
      vehicleNumber: t.vehicleNumber,
      booked: Number(t.booked),
      silentSec,
    };

    if (t.status === "in_progress") {
      if (isDeviating(trail.map((p) => p.offRouteM), settingsValue)) {
        const lastOff = trail.at(-1)?.offRouteM ?? 0;
        signals.push({
          ...common,
          kind: "off_route",
          lateMin: null,
          offRouteM: Math.round(lastOff),
          title: `Отклонение от маршрута: ${who}`,
          details: `Транспорт находится в ${Math.round(lastOff)} м от линии маршрута${t.driverName ? `, водитель ${t.driverName}` : ""}.`,
        });
      }
      if (isTrackingMissing(t.startedAt, lastAt, now, settingsValue)) {
        signals.push({
          ...common,
          kind: "no_tracking",
          lateMin: null,
          offRouteM: null,
          title: `Нет данных о транспорте: ${who}`,
          details: lastAt
            ? `Последняя точка получена ${Math.round((now.getTime() - lastAt.getTime()) / 60_000)} мин назад.`
            : "С начала рейса не получено ни одной точки. Возможно, водитель не включил геолокацию.",
        });
      }
    } else {
      // Planned trip that should already have departed.
      const [h, m] = time.split(":").map(Number);
      const due = new Date(now);
      due.setHours(h ?? 0, m ?? 0, 0, 0);
      const lateMin = (now.getTime() - due.getTime()) / 60_000;
      if (lateMin > settingsValue.missingAfterMin) {
        signals.push({
          ...common,
          kind: "not_started",
          lateMin: Math.round(lateMin),
          offRouteM: null,
          title: `Рейс не начат: ${who}`,
          details: `Отправление было ${Math.round(lateMin)} мин назад, водитель не начал рейс${t.vehicleNumber ? ` (${t.vehicleNumber})` : ""}.`,
        });
      }
    }
  }

  return signals;
}
