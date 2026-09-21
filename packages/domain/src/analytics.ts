import { routeLoadStatus, type LoadThresholds, type TripLoad } from "./load";

/** One completed/observed trip with its load, used for breakdowns. */
export interface TripLoadRecord extends TripLoad {
  tripId: string;
  routeId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  weekday: number; // ISO 1..7
}

export interface BucketStats {
  key: string;
  label: string;
  trips: number;
  avgPct: number | null;
  maxPct: number | null;
  avgPassengers: number | null;
  overloadedTrips: number;
}

function bucketize(
  records: readonly TripLoadRecord[],
  keyOf: (r: TripLoadRecord) => string,
  labelOf: (k: string) => string,
  thresholds?: LoadThresholds,
): BucketStats[] {
  const groups = new Map<string, TripLoadRecord[]>();
  for (const r of records) {
    const k = keyOf(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .map(([key, rs]) => {
      const s = routeLoadStatus(rs, thresholds);
      return {
        key,
        label: labelOf(key),
        trips: s.trips,
        avgPct: s.avgPct,
        maxPct: s.maxPct,
        avgPassengers: s.avgPassengers,
        overloadedTrips: s.overloadedTrips,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Load by departure time (e.g. "07:30"). */
export function loadByDepartureTime(records: readonly TripLoadRecord[], thresholds?: LoadThresholds): BucketStats[] {
  return bucketize(records, (r) => r.startTime.slice(0, 5), (k) => k, thresholds);
}

export const WEEKDAY_LABELS: Record<number, string> = { 1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 7: "Вс" };

/** Load by ISO weekday. */
export function loadByWeekday(records: readonly TripLoadRecord[], thresholds?: LoadThresholds): BucketStats[] {
  return bucketize(records, (r) => String(r.weekday), (k) => WEEKDAY_LABELS[Number(k)] ?? k, thresholds);
}

export interface StopDemandRecord {
  stopId: string;
  stopName: string;
  seq: number;
  /** passengers who declared boarding at this stop (sum over trips) */
  demand: number;
  /** driver-reported boarded (sum over trips) */
  boarded: number;
  trips: number;
}

export interface StopLoadStats extends StopDemandRecord {
  avgDemand: number;
  avgBoarded: number;
  /** average of max(demand, boarded) per trip */
  avgEffective: number;
}

export interface PerTripStopRecord {
  tripId: string;
  stopId: string;
  stopName: string;
  seq: number;
  demand: number;
  boarded: number;
}

/** Per-stop boarding pressure across trips. */
export function loadByStop(perTrip: readonly PerTripStopRecord[]): StopLoadStats[] {
  const acc = new Map<string, StopDemandRecord & { effective: number }>();
  for (const p of perTrip) {
    const cur = acc.get(p.stopId) ?? {
      stopId: p.stopId,
      stopName: p.stopName,
      seq: p.seq,
      demand: 0,
      boarded: 0,
      trips: 0,
      effective: 0,
    };
    cur.demand += p.demand;
    cur.boarded += p.boarded;
    cur.effective += Math.max(p.demand, p.boarded);
    cur.trips += 1;
    acc.set(p.stopId, cur);
  }
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return [...acc.values()]
    .map((r) => ({
      ...r,
      avgDemand: r.trips ? round1(r.demand / r.trips) : 0,
      avgBoarded: r.trips ? round1(r.boarded / r.trips) : 0,
      avgEffective: r.trips ? round1(r.effective / r.trips) : 0,
    }))
    .sort((a, b) => a.seq - b.seq);
}
