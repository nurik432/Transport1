import "server-only";
import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import {
  DEFAULT_THRESHOLDS,
  etaForStop,
  etaFromPosition,
  plannedSpeedKph,
  trackingState,
  localDateTime,
  parseTimeToMinutes,
  type EtaResult,
  type LoadThresholds,
  type TripLoadRecord,
  tripLoad,
  weekdayOfDate,
} from "@transport/domain";
import { db, schema } from "./db";

const { routes, routeStops, routeSchedules, stops, trips, tripStopEvents, passengerTrips, vehicles, users, drivers, passengers, settings } =
  schema;

// ---------------------------------------------------------------- settings

export async function getThresholds(): Promise<LoadThresholds> {
  const row = await db.select().from(settings).where(eq(settings.key, "load_thresholds")).limit(1);
  const value = row[0]?.value as Partial<LoadThresholds> | undefined;
  return { ...DEFAULT_THRESHOLDS, ...(value ?? {}) };
}

export async function saveThresholds(next: LoadThresholds): Promise<void> {
  await db
    .insert(settings)
    .values({ key: "load_thresholds", value: next as unknown as Record<string, unknown>, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: next as unknown as Record<string, unknown>, updatedAt: new Date() },
    });
}

// ---------------------------------------------------------------- routes

export interface RouteStopRow {
  stopId: string;
  seq: number;
  offsetMin: number;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
}

export interface RouteDetail {
  id: string;
  name: string;
  description: string | null;
  direction: "to_work" | "from_work";
  status: "draft" | "active" | "inactive";
  color: string;
  plannedCapacity: number | null;
  stops: RouteStopRow[];
  schedules: { id: string; departureTime: string; daysOfWeek: number[]; active: boolean }[];
}

/** All routes with their stops and schedules. `onlyActive` filters out drafts. */
export async function listRoutes(onlyActive = true): Promise<RouteDetail[]> {
  const routeRows = await db
    .select()
    .from(routes)
    .where(onlyActive ? eq(routes.status, "active") : sql`true`)
    .orderBy(asc(routes.name), asc(routes.direction));
  if (!routeRows.length) return [];

  const ids = routeRows.map((r) => r.id);
  const [stopRows, scheduleRows] = await Promise.all([
    db
      .select({
        routeId: routeStops.routeId,
        stopId: routeStops.stopId,
        seq: routeStops.seq,
        offsetMin: routeStops.offsetMin,
        name: stops.name,
        lat: stops.lat,
        lng: stops.lng,
        address: stops.address,
      })
      .from(routeStops)
      .innerJoin(stops, eq(stops.id, routeStops.stopId))
      .where(inArray(routeStops.routeId, ids))
      .orderBy(asc(routeStops.seq)),
    db
      .select()
      .from(routeSchedules)
      .where(inArray(routeSchedules.routeId, ids))
      .orderBy(asc(routeSchedules.departureTime)),
  ]);

  return routeRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    direction: r.direction,
    status: r.status,
    color: r.color,
    plannedCapacity: r.plannedCapacity,
    stops: stopRows
      .filter((s) => s.routeId === r.id)
      .map((s) => ({ stopId: s.stopId, seq: s.seq, offsetMin: s.offsetMin, name: s.name, lat: s.lat, lng: s.lng, address: s.address })),
    schedules: scheduleRows
      .filter((s) => s.routeId === r.id)
      .map((s) => ({ id: s.id, departureTime: s.departureTime.slice(0, 5), daysOfWeek: s.daysOfWeek, active: s.active })),
  }));
}

export async function getRoute(id: string): Promise<RouteDetail | null> {
  const all = await listRoutes(false);
  return all.find((r) => r.id === id) ?? null;
}

export async function listStops() {
  return db.select().from(stops).orderBy(asc(stops.name));
}

// ---------------------------------------------------------------- arrivals (passenger)

export interface Arrival {
  tripId: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  direction: "to_work" | "from_work";
  date: string;
  startTime: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  stopId: string;
  stopName: string;
  seq: number;
  eta: EtaResult;
  vehicle: { number: string; model: string; capacity: number } | null;
  /** current bookings for this trip */
  booked: number;
  /** true when the signed-in passenger already booked this trip */
  bookedByMe: boolean;
}

interface UpcomingArrivalsOptions {
  stopIds: string[];
  dates: string[];
  now: Date;
  passengerId?: string;
  limit?: number;
}

/**
 * Upcoming arrivals at the given stops over the given dates, sorted by ETA.
 * ETA comes from the schedule and is re-based on driver stop marks when a trip is running.
 */
export async function getUpcomingArrivals(opts: UpcomingArrivalsOptions): Promise<Arrival[]> {
  const { stopIds, dates, now, passengerId, limit = 12 } = opts;
  if (!stopIds.length || !dates.length) return [];

  const rows = await db
    .select({
      tripId: trips.id,
      routeId: routes.id,
      routeName: routes.name,
      routeColor: routes.color,
      direction: routes.direction,
      date: trips.date,
      startTime: trips.startTime,
      status: trips.status,
      stopId: routeStops.stopId,
      stopName: stops.name,
      seq: routeStops.seq,
      offsetMin: routeStops.offsetMin,
      vehicleNumber: vehicles.number,
      vehicleModel: vehicles.model,
      vehicleCapacity: vehicles.capacity,
    })
    .from(trips)
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .innerJoin(routeStops, and(eq(routeStops.routeId, trips.routeId), inArray(routeStops.stopId, stopIds)))
    .innerJoin(stops, eq(stops.id, routeStops.stopId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(and(inArray(trips.date, dates), inArray(trips.status, ["planned", "in_progress"])));
  if (!rows.length) return [];

  const tripIds = [...new Set(rows.map((r) => r.tripId))];
  const routeIds = [...new Set(rows.map((r) => r.routeId))];

  const [allRouteStops, events, bookings, myBookings] = await Promise.all([
    db
      .select({
        routeId: routeStops.routeId,
        stopId: routeStops.stopId,
        seq: routeStops.seq,
        offsetMin: routeStops.offsetMin,
        lat: stops.lat,
        lng: stops.lng,
      })
      .from(routeStops)
      .innerJoin(stops, eq(stops.id, routeStops.stopId))
      .where(inArray(routeStops.routeId, routeIds)),
    db
      .select({ tripId: tripStopEvents.tripId, stopId: tripStopEvents.stopId, arrivedAt: tripStopEvents.arrivedAt, departedAt: tripStopEvents.departedAt })
      .from(tripStopEvents)
      .where(inArray(tripStopEvents.tripId, tripIds)),
    db
      .select({ tripId: passengerTrips.tripId, n: count() })
      .from(passengerTrips)
      .where(and(inArray(passengerTrips.tripId, tripIds), ne(passengerTrips.status, "cancelled")))
      .groupBy(passengerTrips.tripId),
    passengerId
      ? db
          .select({ tripId: passengerTrips.tripId })
          .from(passengerTrips)
          .where(
            and(
              inArray(passengerTrips.tripId, tripIds),
              eq(passengerTrips.passengerId, passengerId),
              ne(passengerTrips.status, "cancelled"),
            ),
          )
      : Promise.resolve([] as { tripId: string }[]),
  ]);

  const bookedByTrip = new Map(bookings.map((b) => [b.tripId, Number(b.n)]));
  const mine = new Set(myBookings.map((b) => b.tripId));

  const arrivals: Arrival[] = [];
  for (const r of rows) {
    const tripStartAt = localDateTime(r.date, parseTimeToMinutes(r.startTime));
    const eta = etaForStop({
      tripStartAt,
      routeStops: allRouteStops.filter((rs) => rs.routeId === r.routeId),
      events: events.filter((e) => e.tripId === r.tripId),
      targetStopId: r.stopId,
      now,
    });
    if (!eta || eta.passed || eta.arrivalAt.getTime() < now.getTime() - 60_000) continue;
    arrivals.push({
      tripId: r.tripId,
      routeId: r.routeId,
      routeName: r.routeName,
      routeColor: r.routeColor,
      direction: r.direction,
      date: r.date,
      startTime: r.startTime.slice(0, 5),
      status: r.status,
      stopId: r.stopId,
      stopName: r.stopName,
      seq: r.seq,
      eta,
      vehicle: r.vehicleNumber
        ? { number: r.vehicleNumber, model: r.vehicleModel!, capacity: r.vehicleCapacity! }
        : null,
      booked: bookedByTrip.get(r.tripId) ?? 0,
      bookedByMe: mine.has(r.tripId),
    });
  }

  await applyLivePositions(arrivals, allRouteStops, now);
  return arrivals.sort((a, b) => a.eta.arrivalAt.getTime() - b.eta.arrivalAt.getTime()).slice(0, limit);
}

/**
 * Replace the schedule estimate with a GPS one for trips that are running and
 * still reporting. Mutates `arrivals` in place; a stale trail is left alone.
 */
async function applyLivePositions(
  arrivals: Arrival[],
  routeStopRows: { routeId: string; stopId: string; seq: number; offsetMin: number; lat: number; lng: number }[],
  now: Date,
): Promise<void> {
  const running = [...new Set(arrivals.filter((a) => a.status === "in_progress").map((a) => a.tripId))];
  if (!running.length) return;

  const positions = await db
    .select({
      tripId: schema.vehiclePositions.tripId,
      lat: schema.vehiclePositions.lat,
      lng: schema.vehiclePositions.lng,
      speedKph: schema.vehiclePositions.speedKph,
      recordedAt: schema.vehiclePositions.recordedAt,
    })
    .from(schema.vehiclePositions)
    .where(inArray(schema.vehiclePositions.tripId, running))
    .orderBy(desc(schema.vehiclePositions.recordedAt));

  const latest = new Map<string, (typeof positions)[number]>();
  for (const p of positions) if (!latest.has(p.tripId)) latest.set(p.tripId, p);

  for (const arrival of arrivals) {
    const position = latest.get(arrival.tripId);
    if (!position || trackingState(position.recordedAt, now) === "lost") continue;

    const points = routeStopRows.filter((rs) => rs.routeId === arrival.routeId);
    const live = etaFromPosition({
      position: { lat: position.lat, lng: position.lng, recordedAt: position.recordedAt, speedKph: position.speedKph },
      routeStops: points,
      targetStopId: arrival.stopId,
      now,
      fallbackSpeedKph: plannedSpeedKph(points),
    });
    if (!live) continue;

    arrival.eta = {
      arrivalAt: live.arrivalAt,
      minutesFromNow: live.minutesFromNow,
      source: "position",
      passed: live.passed,
    };
  }
}

// ---------------------------------------------------------------- trip detail

export interface TripStopRow extends RouteStopRow {
  plannedAt: Date;
  arrivedAt: Date | null;
  departedAt: Date | null;
  boarded: number;
  alighted: number;
  /** passengers who booked boarding here */
  waiting: number;
  waitingNames: string[];
}

export interface TripDetail {
  id: string;
  date: string;
  startTime: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  route: { id: string; name: string; color: string; direction: "to_work" | "from_work"; description: string | null };
  vehicle: { id: string; number: string; model: string; capacity: number } | null;
  driver: { id: string; name: string; phone: string } | null;
  stops: TripStopRow[];
  bookedTotal: number;
  bookedByMe: { stopId: string } | null;
}

export async function getTrip(tripId: string, passengerId?: string): Promise<TripDetail | null> {
  const rows = await db
    .select({
      trip: trips,
      route: routes,
      vehicle: vehicles,
      driverId: drivers.userId,
      driverName: users.name,
      driverPhone: users.phone,
    })
    .from(trips)
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(drivers, eq(drivers.userId, trips.driverId))
    .leftJoin(users, eq(users.id, drivers.userId))
    .where(eq(trips.id, tripId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const [stopRows, events, bookings] = await Promise.all([
    db
      .select({
        stopId: routeStops.stopId,
        seq: routeStops.seq,
        offsetMin: routeStops.offsetMin,
        name: stops.name,
        lat: stops.lat,
        lng: stops.lng,
        address: stops.address,
      })
      .from(routeStops)
      .innerJoin(stops, eq(stops.id, routeStops.stopId))
      .where(eq(routeStops.routeId, row.route.id))
      .orderBy(asc(routeStops.seq)),
    db.select().from(tripStopEvents).where(eq(tripStopEvents.tripId, tripId)),
    db
      .select({ stopId: passengerTrips.stopId, passengerId: passengerTrips.passengerId, name: users.name })
      .from(passengerTrips)
      .innerJoin(users, eq(users.id, passengerTrips.passengerId))
      .where(and(eq(passengerTrips.tripId, tripId), ne(passengerTrips.status, "cancelled"))),
  ]);

  const startMin = parseTimeToMinutes(row.trip.startTime);
  const mine = passengerId ? bookings.find((b) => b.passengerId === passengerId) : undefined;

  return {
    id: row.trip.id,
    date: row.trip.date,
    startTime: row.trip.startTime.slice(0, 5),
    status: row.trip.status,
    route: {
      id: row.route.id,
      name: row.route.name,
      color: row.route.color,
      direction: row.route.direction,
      description: row.route.description,
    },
    vehicle: row.vehicle
      ? { id: row.vehicle.id, number: row.vehicle.number, model: row.vehicle.model, capacity: row.vehicle.capacity }
      : null,
    driver: row.driverId ? { id: row.driverId, name: row.driverName!, phone: row.driverPhone! } : null,
    stops: stopRows.map((s) => {
      const event = events.find((e) => e.stopId === s.stopId);
      const here = bookings.filter((b) => b.stopId === s.stopId);
      return {
        ...s,
        plannedAt: localDateTime(row.trip.date, startMin + s.offsetMin),
        arrivedAt: event?.arrivedAt ?? null,
        departedAt: event?.departedAt ?? null,
        boarded: event?.boarded ?? 0,
        alighted: event?.alighted ?? 0,
        waiting: here.length,
        waitingNames: here.map((b) => b.name),
      };
    }),
    bookedTotal: bookings.length,
    bookedByMe: mine ? { stopId: mine.stopId } : null,
  };
}

// ---------------------------------------------------------------- driver

export async function getDriverTrips(driverId: string, date: string) {
  const rows = await db
    .select({
      id: trips.id,
      date: trips.date,
      startTime: trips.startTime,
      status: trips.status,
      routeId: routes.id,
      routeName: routes.name,
      routeColor: routes.color,
      direction: routes.direction,
      description: routes.description,
      vehicleNumber: vehicles.number,
      vehicleModel: vehicles.model,
      vehicleCapacity: vehicles.capacity,
      booked: sql<number>`(select count(*) from ${passengerTrips} pt where pt.trip_id = ${trips.id} and pt.status <> 'cancelled')`,
    })
    .from(trips)
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(and(eq(trips.driverId, driverId), eq(trips.date, date)))
    .orderBy(asc(trips.startTime));
  return rows.map((r) => ({ ...r, startTime: r.startTime.slice(0, 5), booked: Number(r.booked) }));
}

/** The driver's trip that is running now, if any. */
export async function getActiveDriverTrip(driverId: string): Promise<string | null> {
  const row = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.driverId, driverId), eq(trips.status, "in_progress")))
    .orderBy(asc(trips.startTime))
    .limit(1);
  return row[0]?.id ?? null;
}

// ---------------------------------------------------------------- analytics

export interface LoadQuery {
  from: string;
  to: string;
  routeId?: string;
}

/** Per-trip load records for completed trips in a date range. */
export async function getTripLoadRecords(q: LoadQuery): Promise<TripLoadRecord[]> {
  const where = [eq(trips.status, "completed"), gte(trips.date, q.from), lte(trips.date, q.to)];
  if (q.routeId) where.push(eq(trips.routeId, q.routeId));

  const rows = await db
    .select({
      tripId: trips.id,
      routeId: trips.routeId,
      date: trips.date,
      startTime: trips.startTime,
      capacity: vehicles.capacity,
      demand: sql<number>`(select count(*) from ${passengerTrips} pt where pt.trip_id = ${trips.id} and pt.status <> 'cancelled')`,
    })
    .from(trips)
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(and(...where));
  if (!rows.length) return [];

  const tripIds = rows.map((r) => r.tripId);
  const events = await db
    .select({
      tripId: tripStopEvents.tripId,
      seq: routeStops.seq,
      boarded: tripStopEvents.boarded,
      alighted: tripStopEvents.alighted,
    })
    .from(tripStopEvents)
    .innerJoin(trips, eq(trips.id, tripStopEvents.tripId))
    .innerJoin(routeStops, and(eq(routeStops.routeId, trips.routeId), eq(routeStops.stopId, tripStopEvents.stopId)))
    .where(inArray(tripStopEvents.tripId, tripIds));

  const byTrip = new Map<string, { seq: number; boarded: number; alighted: number }[]>();
  for (const e of events) {
    const list = byTrip.get(e.tripId);
    if (list) list.push(e);
    else byTrip.set(e.tripId, [e]);
  }

  return rows.map((r) => ({
    ...tripLoad({ capacity: r.capacity ?? null, demand: Number(r.demand), events: byTrip.get(r.tripId) ?? [] }),
    tripId: r.tripId,
    routeId: r.routeId,
    date: r.date,
    startTime: r.startTime.slice(0, 5),
    weekday: weekdayOfDate(r.date),
  }));
}

/** Per-trip, per-stop demand and boarded counts, for the per-stop breakdown. */
export async function getStopLoadRecords(q: LoadQuery) {
  const where = [eq(trips.status, "completed"), gte(trips.date, q.from), lte(trips.date, q.to)];
  if (q.routeId) where.push(eq(trips.routeId, q.routeId));

  const boarded = await db
    .select({
      tripId: tripStopEvents.tripId,
      stopId: tripStopEvents.stopId,
      stopName: stops.name,
      seq: routeStops.seq,
      boarded: tripStopEvents.boarded,
    })
    .from(tripStopEvents)
    .innerJoin(trips, eq(trips.id, tripStopEvents.tripId))
    .innerJoin(stops, eq(stops.id, tripStopEvents.stopId))
    .innerJoin(routeStops, and(eq(routeStops.routeId, trips.routeId), eq(routeStops.stopId, tripStopEvents.stopId)))
    .where(and(...where));

  const demand = await db
    .select({
      tripId: passengerTrips.tripId,
      stopId: passengerTrips.stopId,
      n: count(),
    })
    .from(passengerTrips)
    .innerJoin(trips, eq(trips.id, passengerTrips.tripId))
    .where(and(...where, ne(passengerTrips.status, "cancelled")))
    .groupBy(passengerTrips.tripId, passengerTrips.stopId);

  const demandMap = new Map(demand.map((d) => [`${d.tripId}:${d.stopId}`, Number(d.n)]));
  return boarded.map((b) => ({
    tripId: b.tripId,
    stopId: b.stopId,
    stopName: b.stopName,
    seq: b.seq,
    boarded: b.boarded,
    demand: demandMap.get(`${b.tripId}:${b.stopId}`) ?? 0,
  }));
}

export interface DashboardCounts {
  routes: number;
  vehicles: number;
  drivers: number;
  passengers: number;
  activePassengers: number;
  tripsToday: number;
  tripsCompletedToday: number;
}

export async function getDashboardCounts(from: string, today: string): Promise<DashboardCounts> {
  const [routeCount, vehicleCount, driverCount, passengerCount, activeCount, todayTrips] = await Promise.all([
    db.select({ n: count() }).from(routes).where(eq(routes.status, "active")),
    db.select({ n: count() }).from(vehicles).where(ne(vehicles.status, "inactive")),
    db.select({ n: count() }).from(drivers).where(eq(drivers.status, "active")),
    db.select({ n: count() }).from(passengers),
    db
      .select({ n: sql<number>`count(distinct ${passengerTrips.passengerId})` })
      .from(passengerTrips)
      .innerJoin(trips, eq(trips.id, passengerTrips.tripId))
      .where(and(gte(trips.date, from), ne(passengerTrips.status, "cancelled"))),
    db.select({ status: trips.status, n: count() }).from(trips).where(eq(trips.date, today)).groupBy(trips.status),
  ]);

  const tripsToday = todayTrips.reduce((s, r) => s + Number(r.n), 0);
  return {
    routes: Number(routeCount[0]?.n ?? 0),
    vehicles: Number(vehicleCount[0]?.n ?? 0),
    drivers: Number(driverCount[0]?.n ?? 0),
    passengers: Number(passengerCount[0]?.n ?? 0),
    activePassengers: Number(activeCount[0]?.n ?? 0),
    tripsToday,
    tripsCompletedToday: Number(todayTrips.find((t) => t.status === "completed")?.n ?? 0),
  };
}

/** Trips of one route on a date, with booking counts. */
export async function getRouteTrips(routeId: string, date: string) {
  const rows = await db
    .select({
      id: trips.id,
      date: trips.date,
      startTime: trips.startTime,
      status: trips.status,
      vehicleCapacity: vehicles.capacity,
      booked: sql<number>`(select count(*) from ${passengerTrips} pt where pt.trip_id = ${trips.id} and pt.status <> 'cancelled')`,
    })
    .from(trips)
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(and(eq(trips.routeId, routeId), eq(trips.date, date)))
    .orderBy(asc(trips.startTime));
  return rows.map((r) => ({ ...r, startTime: r.startTime.slice(0, 5), booked: Number(r.booked) }));
}

/** Route ids and stop ids the passenger marked as favourite. */
export async function getFavorites(passengerId: string) {
  const rows = await db
    .select({ routeId: schema.passengerFavorites.routeId, stopId: schema.passengerFavorites.stopId })
    .from(schema.passengerFavorites)
    .where(eq(schema.passengerFavorites.passengerId, passengerId));
  return {
    routeIds: new Set(rows.map((r) => r.routeId).filter((x): x is string => Boolean(x))),
    stopIds: new Set(rows.map((r) => r.stopId).filter((x): x is string => Boolean(x))),
  };
}

// ---------------------------------------------------------------- notifications

export async function getNotifications(userId: string, limit = 30) {
  return db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

export async function countUnread(userId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), sql`${schema.notifications.readAt} is null`));
  return Number(rows[0]?.n ?? 0);
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, userId), sql`${schema.notifications.readAt} is null`));
}
