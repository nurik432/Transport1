import { distanceMeters, type LatLng } from "./geo";

/**
 * Where employees live and whether the current stop network reaches them.
 *
 * Nothing here changes the network: these functions produce proposals with the
 * numbers behind them, and the administrator decides.
 */

export interface HomePoint extends LatLng {
  passengerId: string;
  name: string;
}

export interface StopPoint extends LatLng {
  id: string;
  name: string;
}

export interface NearestStopInfo {
  id: string;
  name: string;
  distanceM: number;
}

export interface HomeCluster {
  id: string;
  center: LatLng;
  members: string[];
  names: string[];
  size: number;
  /** distance from the centre to the farthest member */
  spreadM: number;
  nearestStop: NearestStopInfo | null;
}

export interface ClusterOptions {
  /** employees within this distance of each other form one cluster (default 700 m) */
  radiusM?: number;
  /** clusters smaller than this are not reported (default 3) */
  minSize?: number;
}

function meanPoint(points: readonly LatLng[]): LatLng {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return { lat, lng };
}

function clusterId(center: LatLng): string {
  return `c${center.lat.toFixed(4)}_${center.lng.toFixed(4)}`;
}

/**
 * Group home addresses that sit close together.
 * Greedy and deterministic: the densest point seeds a cluster, everything within
 * the radius joins it, and the centre is refined once.
 */
export function clusterHomes(points: readonly HomePoint[], options: ClusterOptions = {}): HomeCluster[] {
  const radiusM = options.radiusM ?? 700;
  const minSize = options.minSize ?? 3;

  let remaining = [...points].sort((a, b) => a.passengerId.localeCompare(b.passengerId));
  const clusters: HomeCluster[] = [];

  while (remaining.length > 0) {
    let seed = remaining[0]!;
    let bestCount = -1;
    for (const p of remaining) {
      const count = remaining.filter((q) => distanceMeters(p, q) <= radiusM).length;
      if (count > bestCount) {
        bestCount = count;
        seed = p;
      }
    }

    const initial = remaining.filter((q) => distanceMeters(seed, q) <= radiusM);
    const refinedCenter = meanPoint(initial);
    const refined = remaining.filter((q) => distanceMeters(refinedCenter, q) <= radiusM);
    const members = refined.length >= initial.length ? refined : initial;
    const center = meanPoint(members);

    clusters.push({
      id: clusterId(center),
      center,
      members: members.map((m) => m.passengerId),
      names: members.map((m) => m.name),
      size: members.length,
      spreadM: Math.round(Math.max(...members.map((m) => distanceMeters(center, m)))),
      nearestStop: null,
    });

    const taken = new Set(members.map((m) => m.passengerId));
    remaining = remaining.filter((p) => !taken.has(p.passengerId));
  }

  return clusters
    .filter((c) => c.size >= minSize)
    .sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
}

/** Attach the closest existing stop to every cluster. */
export function withNearestStops(clusters: readonly HomeCluster[], stops: readonly StopPoint[]): HomeCluster[] {
  return clusters.map((cluster) => {
    let nearest: NearestStopInfo | null = null;
    for (const stop of stops) {
      const distanceM = Math.round(distanceMeters(cluster.center, stop));
      if (!nearest || distanceM < nearest.distanceM) nearest = { id: stop.id, name: stop.name, distanceM };
    }
    return { ...cluster, nearestStop: nearest };
  });
}

/** Clusters whose nearest stop is beyond comfortable walking distance. */
export function underservedClusters(clusters: readonly HomeCluster[], walkRadiusM = 600): HomeCluster[] {
  return clusters.filter((c) => !c.nearestStop || c.nearestStop.distanceM > walkRadiusM);
}

export interface ProposedStop {
  /** set when an existing stop already serves this cluster */
  stopId: string | null;
  name: string;
  lat: number;
  lng: number;
  offsetMin: number;
  expectedPassengers: number;
  isNew: boolean;
}

export interface RouteProposal {
  stops: ProposedStop[];
  totalDistanceM: number;
  durationMin: number;
  expectedPassengers: number;
  clusterIds: string[];
}

export interface ProposalOptions {
  /** average travel speed used to turn distance into minutes (default 22 km/h) */
  speedKph?: number;
  /** time added per intermediate stop (default 1 min) */
  dwellMin?: number;
  /** an existing stop this close to a cluster is reused instead of adding a new one (default 400 m) */
  reuseStopRadiusM?: number;
}

/**
 * Draft a collecting route: pick up each cluster, then finish at the destination.
 * Stops are ordered by nearest-neighbour starting from the cluster farthest from
 * the destination, which is how a collecting run is normally driven.
 */
export function proposeRoute(
  clusters: readonly HomeCluster[],
  destination: StopPoint,
  existingStops: readonly StopPoint[] = [],
  options: ProposalOptions = {},
): RouteProposal | null {
  if (clusters.length === 0) return null;
  const speedKph = options.speedKph && options.speedKph > 0 ? options.speedKph : 22;
  const dwellMin = options.dwellMin ?? 1;
  const reuseRadius = options.reuseStopRadiusM ?? 400;

  // Start from the cluster farthest away, then always hop to the closest one left.
  const pending = [...clusters];
  pending.sort((a, b) => distanceMeters(b.center, destination) - distanceMeters(a.center, destination));
  const ordered: HomeCluster[] = [pending.shift()!];
  while (pending.length > 0) {
    const last = ordered.at(-1)!;
    let bestIndex = 0;
    let bestDistance = Infinity;
    pending.forEach((c, i) => {
      const d = distanceMeters(last.center, c.center);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    });
    ordered.push(pending.splice(bestIndex, 1)[0]!);
  }

  const stops: ProposedStop[] = [];
  let distance = 0;
  let minutes = 0;

  ordered.forEach((cluster, index) => {
    if (index > 0) {
      const leg = distanceMeters(ordered[index - 1]!.center, cluster.center);
      distance += leg;
      minutes += (leg / 1000 / speedKph) * 60 + dwellMin;
    }

    // Reuse an existing stop when one is right next to the cluster.
    let reused: StopPoint | null = null;
    for (const stop of existingStops) {
      if (distanceMeters(cluster.center, stop) <= reuseRadius) {
        if (!reused || distanceMeters(cluster.center, stop) < distanceMeters(cluster.center, reused)) reused = stop;
      }
    }

    stops.push({
      stopId: reused?.id ?? null,
      name: reused?.name ?? `Новая остановка (${cluster.size} чел.)`,
      lat: reused?.lat ?? cluster.center.lat,
      lng: reused?.lng ?? cluster.center.lng,
      offsetMin: Math.round(minutes),
      expectedPassengers: cluster.size,
      isNew: !reused,
    });
  });

  const lastLeg = distanceMeters(ordered.at(-1)!.center, destination);
  distance += lastLeg;
  minutes += (lastLeg / 1000 / speedKph) * 60;

  stops.push({
    stopId: destination.id,
    name: destination.name,
    lat: destination.lat,
    lng: destination.lng,
    offsetMin: Math.round(minutes),
    expectedPassengers: 0,
    isNew: false,
  });

  return {
    stops,
    totalDistanceM: Math.round(distance),
    durationMin: Math.round(minutes),
    expectedPassengers: clusters.reduce((s, c) => s + c.size, 0),
    clusterIds: ordered.map((c) => c.id),
  };
}

export interface MultiProposalOptions extends ProposalOptions {
  /** groups farther apart than this get their own route (default 8000 m) */
  maxLegM?: number;
}

/**
 * Split uncovered groups into separate routes.
 * Groups on opposite sides of the city do not belong on one bus, so a new route
 * is started whenever the next pickup is farther away than `maxLegM`.
 */
export function proposeRoutes(
  clusters: readonly HomeCluster[],
  destination: StopPoint,
  existingStops: readonly StopPoint[] = [],
  options: MultiProposalOptions = {},
): RouteProposal[] {
  if (clusters.length === 0) return [];
  const maxLegM = options.maxLegM ?? 8000;

  // Farthest from the destination first: that is where a collecting run starts.
  const pending = [...clusters].sort(
    (a, b) => distanceMeters(b.center, destination) - distanceMeters(a.center, destination),
  );

  const groups: HomeCluster[][] = [];
  while (pending.length > 0) {
    const group = [pending.shift()!];
    let grew = true;
    while (grew && pending.length > 0) {
      grew = false;
      const last = group.at(-1)!;
      let bestIndex = -1;
      let bestDistance = Infinity;
      pending.forEach((c, i) => {
        const d = distanceMeters(last.center, c.center);
        if (d <= maxLegM && d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
        }
      });
      if (bestIndex >= 0) {
        group.push(pending.splice(bestIndex, 1)[0]!);
        grew = true;
      }
    }
    groups.push(group);
  }

  return groups
    .map((group) => proposeRoute(group, destination, existingStops, options))
    .filter((p): p is RouteProposal => p !== null)
    .sort((a, b) => b.expectedPassengers - a.expectedPassengers);
}

export interface StopSuggestion {
  cluster: HomeCluster;
  /** route the new stop would be added to */
  routeId: string;
  routeName: string;
  /** how far the cluster sits from that route's line */
  detourM: number;
}

/**
 * Clusters that sit close to an existing route but have no stop nearby:
 * adding one stop is cheaper than creating a route.
 */
export function suggestStopsOnRoutes(
  clusters: readonly HomeCluster[],
  routes: readonly { id: string; name: string; points: readonly LatLng[] }[],
  options: { maxDetourM?: number; walkRadiusM?: number } = {},
): StopSuggestion[] {
  const maxDetour = options.maxDetourM ?? 800;
  const walkRadius = options.walkRadiusM ?? 600;
  const out: StopSuggestion[] = [];

  for (const cluster of clusters) {
    if (cluster.nearestStop && cluster.nearestStop.distanceM <= walkRadius) continue;

    let best: StopSuggestion | null = null;
    for (const route of routes) {
      if (route.points.length < 2) continue;
      let closest = Infinity;
      for (let i = 0; i < route.points.length - 1; i++) {
        const d = segmentDistance(cluster.center, route.points[i]!, route.points[i + 1]!);
        if (d < closest) closest = d;
      }
      if (closest <= maxDetour && (!best || closest < best.detourM)) {
        best = { cluster, routeId: route.id, routeName: route.name, detourM: Math.round(closest) };
      }
    }
    if (best) out.push(best);
  }

  return out.sort((a, b) => b.cluster.size - a.cluster.size || a.detourM - b.detourM);
}

/** Distance from a point to a segment, in metres (local flat projection). */
function segmentDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}
