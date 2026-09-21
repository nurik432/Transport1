import { distanceMeters, type LatLng } from "./geo";

/** A route stop with coordinates, used to build the route polyline. */
export interface RoutePoint extends LatLng {
  stopId: string;
  seq: number;
  offsetMin: number;
}

export interface LivePosition extends LatLng {
  recordedAt: Date;
  speedKph?: number | null;
}

const MS_PER_MIN = 60_000;
/** Speeds outside this band are treated as noise (stopped bus, GPS jump). */
const MIN_SPEED_KPH = 8;
const MAX_SPEED_KPH = 80;

function ordered(routeStops: readonly RoutePoint[]): RoutePoint[] {
  return [...routeStops].sort((a, b) => a.seq - b.seq);
}

/**
 * Perpendicular distance from `p` to segment `a`-`b`, in metres.
 * Uses a local flat projection, which is accurate over city distances.
 */
export function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const latRad = (a.lat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(latRad);
  const toXY = (q: LatLng) => ({ x: (q.lng - a.lng) * mPerDegLng, y: (q.lat - a.lat) * mPerDegLat });

  const P = toXY(p);
  const B = toXY(b);
  const len2 = B.x * B.x + B.y * B.y;
  if (len2 === 0) return Math.hypot(P.x, P.y);

  const t = Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2));
  return Math.hypot(P.x - t * B.x, P.y - t * B.y);
}

export interface RouteProjection {
  /** index of the segment the vehicle is on (0 = between stop 1 and 2) */
  segmentIndex: number;
  /** distance from the route line, in metres */
  offRouteM: number;
  /** distance travelled along the route from its first stop, in metres */
  alongM: number;
}

/** Cumulative distance along the route to each stop, in metres. */
export function cumulativeDistances(routeStops: readonly RoutePoint[]): number[] {
  const pts = ordered(routeStops);
  const out: number[] = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1]! + distanceMeters(pts[i - 1]!, pts[i]!));
  return out;
}

/** Snap a position onto the route polyline. Returns null for routes with fewer than two stops. */
export function projectOnRoute(position: LatLng, routeStops: readonly RoutePoint[]): RouteProjection | null {
  const pts = ordered(routeStops);
  if (pts.length < 2) return null;
  const cum = cumulativeDistances(pts);

  let best: RouteProjection | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const offRouteM = distanceToSegment(position, a, b);
    if (best && offRouteM >= best.offRouteM) continue;

    // How far along this segment the projection falls.
    const segLen = distanceMeters(a, b);
    const da = distanceMeters(a, position);
    const along = segLen === 0 ? 0 : Math.max(0, Math.min(segLen, Math.sqrt(Math.max(0, da * da - offRouteM * offRouteM))));
    best = { segmentIndex: i, offRouteM, alongM: cum[i]! + along };
  }
  return best;
}

/** Average speed between consecutive positions, ignoring jumps. Null when it cannot be estimated. */
export function averageSpeedKph(positions: readonly LivePosition[]): number | null {
  const pts = [...positions].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  let meters = 0;
  let seconds = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i]!.recordedAt.getTime() - pts[i - 1]!.recordedAt.getTime()) / 1000;
    if (dt <= 0 || dt > 300) continue;
    meters += distanceMeters(pts[i - 1]!, pts[i]!);
    seconds += dt;
  }
  if (seconds < 20 || meters < 50) return null;
  return (meters / seconds) * 3.6;
}

/** Planned average speed of the route, from stop distances and time offsets. */
export function plannedSpeedKph(routeStops: readonly RoutePoint[]): number | null {
  const pts = ordered(routeStops);
  if (pts.length < 2) return null;
  const minutes = pts.at(-1)!.offsetMin - pts[0]!.offsetMin;
  if (minutes <= 0) return null;
  const cum = cumulativeDistances(pts);
  const meters = cum.at(-1)!;
  if (meters <= 0) return null;
  return (meters / (minutes * 60)) * 3.6;
}

export interface LiveEta {
  arrivalAt: Date;
  minutesFromNow: number;
  source: "position";
  /** remaining distance along the route, in metres */
  distanceM: number;
  speedKph: number;
  passed: boolean;
}

export interface LiveEtaInput {
  position: LivePosition;
  routeStops: readonly RoutePoint[];
  targetStopId: string;
  now: Date;
  /** used when the device reports no usable speed */
  fallbackSpeedKph?: number | null;
}

/**
 * Arrival time at a stop from the vehicle's current position.
 * The vehicle is snapped onto the route line, so the estimate follows the route
 * rather than the straight line to the stop.
 */
export function etaFromPosition(input: LiveEtaInput): LiveEta | null {
  const pts = ordered(input.routeStops);
  const target = pts.findIndex((p) => p.stopId === input.targetStopId);
  if (target < 0) return null;

  const projection = projectOnRoute(input.position, pts);
  if (!projection) return null;

  const cum = cumulativeDistances(pts);
  const remaining = cum[target]! - projection.alongM;

  const reported = input.position.speedKph;
  const usable = reported != null && reported >= MIN_SPEED_KPH && reported <= MAX_SPEED_KPH ? reported : null;
  const fallback = input.fallbackSpeedKph ?? null;
  const speedKph = Math.min(
    MAX_SPEED_KPH,
    Math.max(MIN_SPEED_KPH, usable ?? (fallback && fallback > 0 ? fallback : 20)),
  );

  if (remaining <= 0) {
    return { arrivalAt: input.now, minutesFromNow: 0, source: "position", distanceM: 0, speedKph, passed: true };
  }

  const minutes = remaining / ((speedKph * 1000) / 60);
  const arrivalAt = new Date(input.now.getTime() + minutes * MS_PER_MIN);
  return {
    arrivalAt,
    minutesFromNow: Math.round(minutes),
    source: "position",
    distanceM: Math.round(remaining),
    speedKph: Math.round(speedKph),
    passed: false,
  };
}

export type TrackingState = "live" | "stale" | "lost" | "none";

export interface TrackingThresholds {
  /** positions newer than this are "live" (seconds) */
  liveSec: number;
  /** older than this and the vehicle is considered lost (seconds) */
  lostSec: number;
}

export const DEFAULT_TRACKING: TrackingThresholds = { liveSec: 90, lostSec: 300 };

/** How trustworthy the last known position is. */
export function trackingState(
  lastAt: Date | null | undefined,
  now: Date,
  thresholds: TrackingThresholds = DEFAULT_TRACKING,
): TrackingState {
  if (!lastAt) return "none";
  const age = (now.getTime() - lastAt.getTime()) / 1000;
  if (age <= thresholds.liveSec) return "live";
  if (age <= thresholds.lostSec) return "stale";
  return "lost";
}

export interface DeviationSettings {
  /** metres from the route line that count as a deviation */
  offRouteM: number;
  /** consecutive deviating positions before raising a signal */
  consecutive: number;
  /** minutes a started trip may go without positions before it counts as missing */
  missingAfterMin: number;
  /** minutes before a stop when the passenger gets the "approaching" notice */
  approachMin: number;
}

export const DEFAULT_DEVIATION: DeviationSettings = {
  offRouteM: 300,
  consecutive: 3,
  missingAfterMin: 10,
  approachMin: 5,
};

/**
 * True when the last positions are consistently away from the route.
 * Positions must be newest-last.
 */
export function isDeviating(
  offRouteSeries: readonly (number | null)[],
  settings: DeviationSettings = DEFAULT_DEVIATION,
): boolean {
  const tail = offRouteSeries.slice(-settings.consecutive);
  if (tail.length < settings.consecutive) return false;
  return tail.every((d) => d !== null && d > settings.offRouteM);
}

/** True when a running trip has stopped reporting for too long. */
export function isTrackingMissing(
  startedAt: Date | null,
  lastPositionAt: Date | null,
  now: Date,
  settings: DeviationSettings = DEFAULT_DEVIATION,
): boolean {
  if (!startedAt) return false;
  const since = lastPositionAt ?? startedAt;
  return (now.getTime() - since.getTime()) / MS_PER_MIN > settings.missingAfterMin;
}

/** Whether a passenger waiting at a stop should be told the vehicle is close. */
export function shouldAlertApproaching(
  eta: Pick<LiveEta, "minutesFromNow" | "passed">,
  settings: DeviationSettings = DEFAULT_DEVIATION,
): boolean {
  return !eta.passed && eta.minutesFromNow >= 0 && eta.minutesFromNow <= settings.approachMin;
}

/** "1,2 км" / "350 м" for a remaining distance. */
export function formatRemaining(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM / 50) * 50} м`;
  // Explicit rounding: toFixed(1) rounds 1.45 down because of float representation.
  const km = Math.round(distanceM / 100) / 10;
  return `${km.toFixed(1).replace(".", ",")} км`;
}
