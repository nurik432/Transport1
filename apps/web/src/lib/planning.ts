import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  addDays,
  clusterHomes,
  forecastTrip,
  localNow,
  peakDepartures,
  proposeRoutes,
  suggestStopsOnRoutes,
  underservedClusters,
  withNearestStops,
  type HomeCluster,
  type HomePoint,
  type PeakHint,
  type RouteProposal,
  type StopPoint,
  type StopSuggestion,
  type TripForecast,
  type TripLoadRecord,
} from "@transport/domain";
import { db, schema } from "./db";
import { getTripLoadRecords, listRoutes } from "./queries";

const { trips, routes, vehicles, passengers, users, stops } = schema;

/** How far back the forecast looks, and how far ahead it projects. */
export const HISTORY_DAYS = 28;
export const HORIZON_DAYS = 7;

export interface RouteForecast {
  routeId: string;
  routeName: string;
  routeColor: string;
  direction: "to_work" | "from_work";
  description: string | null;
  trips: TripForecast[];
  peaks: PeakHint[];
  /** trips expected not to fit everyone */
  overflowTrips: number;
  /** largest expected shortfall across the horizon */
  worstShortfall: number;
}

export interface ForecastResult {
  from: string;
  to: string;
  historyFrom: string;
  routes: RouteForecast[];
}

/**
 * Expected demand for every planned trip in the coming days.
 * Each trip is compared with the route's own history for the same departure and weekday.
 */
export async function buildForecast(horizonDays = HORIZON_DAYS): Promise<ForecastResult> {
  const now = localNow();
  const from = now.date;
  const to = addDays(from, horizonDays);
  const historyFrom = addDays(from, -HISTORY_DAYS);

  const [routeRows, history, planned] = await Promise.all([
    listRoutes(true),
    getTripLoadRecords({ from: historyFrom, to: from }),
    db
      .select({
        tripId: trips.id,
        routeId: trips.routeId,
        date: trips.date,
        startTime: trips.startTime,
        capacity: vehicles.capacity,
        plannedCapacity: routes.plannedCapacity,
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .where(and(eq(trips.status, "planned"), gte(trips.date, from), lte(trips.date, to)))
      .orderBy(asc(trips.date), asc(trips.startTime)),
  ]);

  const historyByRoute = new Map<string, TripLoadRecord[]>();
  for (const r of history) {
    const list = historyByRoute.get(r.routeId);
    if (list) list.push(r);
    else historyByRoute.set(r.routeId, [r]);
  }

  const result: RouteForecast[] = [];
  for (const route of routeRows) {
    const routeHistory = historyByRoute.get(route.id) ?? [];
    const forecasts = planned
      .filter((t) => t.routeId === route.id)
      .map((t) =>
        forecastTrip(
          {
            tripId: t.tripId,
            date: t.date,
            startTime: t.startTime.slice(0, 5),
            capacity: t.capacity ?? t.plannedCapacity ?? null,
          },
          routeHistory,
        ),
      );
    if (forecasts.length === 0) continue;

    result.push({
      routeId: route.id,
      routeName: route.name,
      routeColor: route.color,
      direction: route.direction,
      description: route.description,
      trips: forecasts,
      peaks: peakDepartures(forecasts),
      overflowTrips: forecasts.filter((f) => f.risk === "overflow").length,
      worstShortfall: forecasts.reduce((max, f) => Math.max(max, f.shortfall), 0),
    });
  }

  result.sort((a, b) => b.worstShortfall - a.worstShortfall || b.overflowTrips - a.overflowTrips);
  return { from, to, historyFrom, routes: result };
}

/** Forecasts keyed by trip id, for showing expected load next to planned trips. */
export async function forecastByTrip(date: string): Promise<Map<string, TripForecast>> {
  const historyFrom = addDays(date, -HISTORY_DAYS);
  const [history, planned] = await Promise.all([
    getTripLoadRecords({ from: historyFrom, to: date }),
    db
      .select({
        tripId: trips.id,
        routeId: trips.routeId,
        date: trips.date,
        startTime: trips.startTime,
        capacity: vehicles.capacity,
        plannedCapacity: routes.plannedCapacity,
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .where(eq(trips.date, date)),
  ]);

  const byRoute = new Map<string, TripLoadRecord[]>();
  for (const r of history) {
    const list = byRoute.get(r.routeId);
    if (list) list.push(r);
    else byRoute.set(r.routeId, [r]);
  }

  const out = new Map<string, TripForecast>();
  for (const t of planned) {
    out.set(
      t.tripId,
      forecastTrip(
        {
          tripId: t.tripId,
          date: t.date,
          startTime: t.startTime.slice(0, 5),
          capacity: t.capacity ?? t.plannedCapacity ?? null,
        },
        byRoute.get(t.routeId) ?? [],
      ),
    );
  }
  return out;
}

export interface CoverageResult {
  clusters: HomeCluster[];
  underserved: HomeCluster[];
  stopSuggestions: StopSuggestion[];
  proposals: RouteProposal[];
  /** office / common destination the proposal ends at */
  destination: StopPoint | null;
  /** employees whose home coordinates are unknown */
  withoutHome: number;
  totalPassengers: number;
}

export interface CoverageOptions {
  clusterRadiusM?: number;
  minClusterSize?: number;
  walkRadiusM?: number;
}

/**
 * Where employees live versus where the stops are.
 * Produces a draft route for the uncovered areas; nothing is created automatically.
 */
export async function buildCoverage(options: CoverageOptions = {}): Promise<CoverageResult> {
  const clusterRadiusM = options.clusterRadiusM ?? 700;
  const minClusterSize = options.minClusterSize ?? 3;
  const walkRadiusM = options.walkRadiusM ?? 600;

  const [homeRows, stopRows, routeRows, totalRows] = await Promise.all([
    db
      .select({ passengerId: passengers.userId, name: users.name, lat: passengers.lat, lng: passengers.lng })
      .from(passengers)
      .innerJoin(users, eq(users.id, passengers.userId))
      .where(and(isNotNull(passengers.lat), isNotNull(passengers.lng), eq(users.status, "active"))),
    db.select().from(stops).where(eq(stops.status, "active")),
    listRoutes(true),
    db.select({ n: sql<number>`count(*)` }).from(passengers),
  ]);

  const points: HomePoint[] = homeRows.map((h) => ({
    passengerId: h.passengerId,
    name: h.name,
    lat: h.lat!,
    lng: h.lng!,
  }));
  const stopPoints: StopPoint[] = stopRows.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }));

  const clusters = withNearestStops(clusterHomes(points, { radiusM: clusterRadiusM, minSize: minClusterSize }), stopPoints);
  const uncovered = underservedClusters(clusters, walkRadiusM);

  const stopSuggestions = suggestStopsOnRoutes(
    uncovered,
    routeRows
      .filter((r) => r.direction === "to_work")
      .map((r) => ({ id: r.id, name: r.name, points: r.stops.map((s) => ({ lat: s.lat, lng: s.lng })) })),
    { walkRadiusM },
  );

  // The destination is the stop every morning route ends at, usually the office.
  const lastStops = routeRows.filter((r) => r.direction === "to_work").map((r) => r.stops.at(-1));
  const counts = new Map<string, { stop: StopPoint; n: number }>();
  for (const s of lastStops) {
    if (!s) continue;
    const entry = counts.get(s.stopId) ?? { stop: { id: s.stopId, name: s.name, lat: s.lat, lng: s.lng }, n: 0 };
    entry.n += 1;
    counts.set(s.stopId, entry);
  }
  const destination = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.stop ?? null;

  // Only propose a route for clusters that no existing line passes near.
  const suggestedIds = new Set(stopSuggestions.map((s) => s.cluster.id));
  const forNewRoute = uncovered.filter((c) => !suggestedIds.has(c.id));
  const proposals = destination ? proposeRoutes(forNewRoute, destination, stopPoints) : [];

  return {
    clusters,
    underserved: uncovered,
    stopSuggestions,
    proposals,
    destination,
    withoutHome: Math.max(0, Number(totalRows[0]?.n ?? 0) - points.length),
    totalPassengers: Number(totalRows[0]?.n ?? 0),
  };
}

export interface PassengerLeftBehind {
  tripId: string;
  date: string;
  startTime: string;
  routeName: string;
  capacity: number;
  booked: number;
  /** passengers who booked after the vehicle was already full */
  names: string[];
}

/**
 * Who booked a seat beyond the vehicle's capacity, by booking order.
 * Answers the brief's question "which employees cannot get on the route".
 */
export async function getPassengersLeftBehind(from: string, to: string): Promise<PassengerLeftBehind[]> {
  const rows = await db
    .select({
      tripId: trips.id,
      date: trips.date,
      startTime: trips.startTime,
      routeName: routes.name,
      capacity: vehicles.capacity,
      passengerName: users.name,
      createdAt: schema.passengerTrips.createdAt,
    })
    .from(schema.passengerTrips)
    .innerJoin(trips, eq(trips.id, schema.passengerTrips.tripId))
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .innerJoin(users, eq(users.id, schema.passengerTrips.passengerId))
    .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(and(gte(trips.date, from), lte(trips.date, to), inArray(trips.status, ["planned", "in_progress", "completed"])))
    .orderBy(asc(trips.date), asc(trips.startTime), asc(schema.passengerTrips.createdAt));

  const byTrip = new Map<string, PassengerLeftBehind>();
  for (const r of rows) {
    const entry =
      byTrip.get(r.tripId) ??
      ({
        tripId: r.tripId,
        date: r.date,
        startTime: r.startTime.slice(0, 5),
        routeName: r.routeName,
        capacity: r.capacity,
        booked: 0,
        names: [],
      } satisfies PassengerLeftBehind);

    // Rows arrive in booking order, so everyone past the capacity is left behind.
    entry.booked += 1;
    if (entry.booked > r.capacity) entry.names.push(r.passengerName);
    byTrip.set(r.tripId, entry);
  }

  return [...byTrip.values()]
    .filter((t) => t.names.length > 0)
    .sort((a, b) => b.names.length - a.names.length || a.date.localeCompare(b.date));
}
