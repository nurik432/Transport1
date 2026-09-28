import { asc, eq } from "drizzle-orm";
import { cumulativeAlong, distanceMeters, type LatLng } from "@transport/domain";
import type { Db } from "./client";
import * as schema from "./schema";

/**
 * Road geometry for routes.
 *
 * Stop-to-stop straight lines look wrong on a map and make the GPS estimates
 * and the off-route signal unreliable, so the shape of each route is fetched
 * once from a routing provider and stored. Calls happen only when a route is
 * created or its stops change, never on page render.
 *
 * The provider is OSRM-compatible and configurable: point `ROUTING_URL` at a
 * self-hosted instance for production. The public demo server has no service
 * guarantees, and every failure falls back to straight lines.
 */

const REQUEST_TIMEOUT_MS = 15_000;

function routingUrl(): string {
  return process.env.ROUTING_URL ?? "https://router.project-osrm.org";
}

export type PathSource = "road" | "straight";

export interface RoadPath {
  /** polyline as [lat, lng] pairs */
  points: [number, number][];
  totalDistanceM: number;
  /** cumulative distance to each stop, in the order the stops were passed in */
  stopDistancesM: number[];
  source: PathSource;
  error?: string;
}

function round5(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

/** Straight lines between the stops: used when the provider is unavailable. */
function straightPath(stops: readonly LatLng[], error?: string): RoadPath {
  const cumulative = cumulativeAlong(stops);
  return {
    points: stops.map((s) => [round5(s.lat), round5(s.lng)] as [number, number]),
    totalDistanceM: Math.round(cumulative.at(-1) ?? 0),
    stopDistancesM: cumulative.map((d) => Math.round(d)),
    source: "straight",
    error,
  };
}

interface OsrmResponse {
  code?: string;
  message?: string;
  routes?: {
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
    legs?: { distance?: number }[];
  }[];
}

/**
 * Short-lived cache of provider answers, keyed by the exact list of points.
 *
 * Saving a route asks twice over a few seconds: once from the editor for the
 * preview, once on the server to store the geometry. The answer cannot differ
 * between those two calls, so the second one is served from here and the
 * provider sees a single request. What is cached is the provider's answer, not
 * anything the browser sent, so this cannot be used to smuggle in a made-up path.
 *
 * A straight-line fallback expires quickly: once the provider is back, a route
 * must not stay on straight lines for the rest of the window.
 */
const PATH_CACHE_TTL_ROAD_MS = 5 * 60_000;
const PATH_CACHE_TTL_STRAIGHT_MS = 30_000;
const PATH_CACHE_MAX = 100;

const pathCache = new Map<string, { at: number; path: RoadPath }>();

function cachedPath(key: string): RoadPath | null {
  const hit = pathCache.get(key);
  if (!hit) return null;
  const ttl = hit.path.source === "road" ? PATH_CACHE_TTL_ROAD_MS : PATH_CACHE_TTL_STRAIGHT_MS;
  if (Date.now() - hit.at > ttl) {
    pathCache.delete(key);
    return null;
  }
  return hit.path;
}

function cachePath(key: string, path: RoadPath): RoadPath {
  if (pathCache.size >= PATH_CACHE_MAX) {
    for (const k of [...pathCache.keys()].slice(0, Math.floor(PATH_CACHE_MAX / 3))) pathCache.delete(k);
  }
  pathCache.set(key, { at: Date.now(), path });
  return path;
}

/**
 * Ask the routing provider for the driving path through the given stops.
 * Falls back to straight lines on any failure: a route without geometry is
 * still usable, it just looks and estimates less precisely.
 */
export async function fetchRoadPath(stops: readonly LatLng[]): Promise<RoadPath> {
  if (stops.length < 2) return straightPath(stops, "Нужно минимум две остановки");

  const coordinates = stops.map((s) => `${round5(s.lng)},${round5(s.lat)}`).join(";");
  const cached = cachedPath(coordinates);
  if (cached) return cached;

  const url = `${routingUrl()}/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return cachePath(coordinates, straightPath(stops, `Маршрутизатор ответил ${response.status}`));

    const json = (await response.json()) as OsrmResponse;
    const route = json.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (json.code !== "Ok" || !route || !coords || coords.length < 2) {
      return cachePath(coordinates, straightPath(stops, json.message ?? "Маршрутизатор не построил путь"));
    }

    // GeoJSON is [lng, lat]; the rest of the app uses [lat, lng].
    const points = coords.map(([lng, lat]) => [round5(lat), round5(lng)] as [number, number]);

    // Legs sit between consecutive stops, so cumulative sums give stop distances.
    const legs = route.legs ?? [];
    const stopDistancesM: number[] = [0];
    for (let i = 0; i < stops.length - 1; i++) {
      stopDistancesM.push(Math.round((stopDistancesM[i] ?? 0) + (legs[i]?.distance ?? 0)));
    }

    return cachePath(coordinates, {
      points,
      totalDistanceM: Math.round(route.distance ?? stopDistancesM.at(-1) ?? 0),
      stopDistancesM,
      source: "road",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    return cachePath(coordinates, straightPath(stops, `Маршрутизатор недоступен: ${reason}`));
  }
}

// ---------------------------------------------------------------- walking

/** Average walking speed for the straight-line fallback. */
const WALK_SPEED_KPH = 4.5;

function walkRoutingUrl(): string {
  return process.env.WALK_ROUTING_URL ?? "https://routing.openstreetmap.de/routed-foot";
}

export interface WalkPath {
  /** polyline as [lat, lng] pairs */
  points: [number, number][];
  distanceM: number;
  durationMin: number;
  source: PathSource;
  error?: string;
}

function straightWalk(from: LatLng, to: LatLng, error?: string): WalkPath {
  const distanceM = Math.round(distanceMeters(from, to));
  return {
    points: [
      [round5(from.lat), round5(from.lng)],
      [round5(to.lat), round5(to.lng)],
    ],
    distanceM,
    durationMin: Math.max(1, Math.round((distanceM / 1000 / WALK_SPEED_KPH) * 60)),
    source: "straight",
    error,
  };
}

/**
 * Walking path from a passenger to a stop, from an OSRM foot profile.
 * Requested only when the passenger asks for directions; the position is
 * sent to the provider without any identity. Falls back to a straight line.
 */
export async function fetchWalkingPath(from: LatLng, to: LatLng): Promise<WalkPath> {
  const coordinates = `${round5(from.lng)},${round5(from.lat)};${round5(to.lng)},${round5(to.lat)}`;
  const url = `${walkRoutingUrl()}/route/v1/foot/${coordinates}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return straightWalk(from, to, `Маршрутизатор ответил ${response.status}`);

    const json = (await response.json()) as OsrmResponse;
    const route = json.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (json.code !== "Ok" || !route || !coords || coords.length < 2) {
      return straightWalk(from, to, json.message ?? "Маршрутизатор не построил путь");
    }

    const distanceM = Math.round(route.distance ?? 0);
    return {
      points: coords.map(([lng, lat]) => [round5(lat), round5(lng)] as [number, number]),
      distanceM,
      // Some foot profiles report optimistic speeds; never faster than the fallback pace.
      durationMin: Math.max(1, Math.round(Math.max((route.duration ?? 0) / 60, (distanceM / 1000 / WALK_SPEED_KPH) * 60))),
      source: "road",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    return straightWalk(from, to, `Маршрутизатор недоступен: ${reason}`);
  }
}

export interface GeometryResult {
  routeId: string;
  routeName: string;
  versionId: string;
  version: number;
  source: PathSource;
  points: number;
  distanceM: number;
  error?: string;
}

/**
 * Build and store the geometry of one route version.
 * Geometry belongs to a version because every version has its own shape.
 */
export async function rebuildVersionGeometry(db: Db, versionId: string): Promise<GeometryResult | null> {
  const versionRows = await db
    .select({
      versionId: schema.routeVersions.id,
      version: schema.routeVersions.version,
      routeId: schema.routes.id,
      routeName: schema.routes.name,
    })
    .from(schema.routeVersions)
    .innerJoin(schema.routes, eq(schema.routes.id, schema.routeVersions.routeId))
    .where(eq(schema.routeVersions.id, versionId))
    .limit(1);
  const version = versionRows[0];
  if (!version) return null;

  const stopRows = await db
    .select({
      routeStopId: schema.routeStops.id,
      seq: schema.routeStops.seq,
      lat: schema.stops.lat,
      lng: schema.stops.lng,
    })
    .from(schema.routeStops)
    .innerJoin(schema.stops, eq(schema.stops.id, schema.routeStops.stopId))
    .where(eq(schema.routeStops.versionId, versionId))
    .orderBy(asc(schema.routeStops.seq));

  const base = {
    routeId: version.routeId,
    routeName: version.routeName,
    versionId: version.versionId,
    version: version.version,
  };

  if (stopRows.length < 2) {
    await db
      .update(schema.routeVersions)
      .set({ path: null, pathDistanceM: null, pathSource: null, pathUpdatedAt: new Date() })
      .where(eq(schema.routeVersions.id, versionId));
    return { ...base, source: "straight", points: 0, distanceM: 0, error: "Меньше двух остановок" };
  }

  const path = await fetchRoadPath(stopRows.map((s) => ({ lat: s.lat, lng: s.lng })));

  await db
    .update(schema.routeVersions)
    .set({
      path: path.points,
      pathDistanceM: path.totalDistanceM,
      pathSource: path.source,
      pathUpdatedAt: new Date(),
    })
    .where(eq(schema.routeVersions.id, versionId));

  // Store each stop's distance along the road for the arrival estimates.
  for (const [index, stop] of stopRows.entries()) {
    await db
      .update(schema.routeStops)
      .set({ roadDistanceM: path.stopDistancesM[index] ?? null })
      .where(eq(schema.routeStops.id, stop.routeStopId));
  }

  return {
    ...base,
    source: path.source,
    points: path.points.length,
    distanceM: path.totalDistanceM,
    error: path.error,
  };
}

/** Rebuild geometry for every route's current version, one at a time. */
export async function rebuildAllRouteGeometry(db: Db): Promise<GeometryResult[]> {
  const routes = await db
    .select({ currentVersionId: schema.routes.currentVersionId })
    .from(schema.routes)
    .orderBy(asc(schema.routes.name));

  const results: GeometryResult[] = [];
  for (const route of routes) {
    if (!route.currentVersionId) continue;
    const result = await rebuildVersionGeometry(db, route.currentVersionId);
    if (result) results.push(result);
  }
  return results;
}
