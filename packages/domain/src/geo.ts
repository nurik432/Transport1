export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in meters (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface StopLike extends LatLng {
  id: string;
}

export interface NearestStop<T extends StopLike = StopLike> {
  stop: T;
  distanceM: number;
}

/** Stops sorted by distance from origin, optionally limited and filtered by max radius. */
export function nearestStops<T extends StopLike>(
  origin: LatLng,
  stops: readonly T[],
  opts: { limit?: number; maxDistanceM?: number } = {},
): NearestStop<T>[] {
  const { limit = 3, maxDistanceM = Infinity } = opts;
  return stops
    .map((stop) => ({ stop, distanceM: distanceMeters(origin, stop) }))
    .filter((s) => s.distanceM <= maxDistanceM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

/** Human-friendly distance: "350 м" / "1,2 км". */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} м`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} км`;
}
