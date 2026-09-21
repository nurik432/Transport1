export interface HeadcountEvent {
  seq: number;
  boarded: number;
  alighted: number;
}

export interface TripLoadInput {
  /** Vehicle capacity; null/0 when no vehicle assigned. */
  capacity: number | null;
  /** Passengers who declared intent (planned/boarded). */
  demand: number;
  /** Driver headcount events, any order. */
  events: readonly HeadcountEvent[];
}

export interface TripLoad {
  capacity: number | null;
  demand: number;
  maxOnboard: number;
  /** max(demand, maxOnboard) */
  effective: number;
  /** null when capacity unknown */
  loadPct: number | null;
}

export function tripLoad(input: TripLoadInput): TripLoad {
  let onboard = 0;
  let maxOnboard = 0;
  for (const e of [...input.events].sort((a, b) => a.seq - b.seq)) {
    onboard += e.boarded - e.alighted;
    if (onboard > maxOnboard) maxOnboard = onboard;
  }
  const effective = Math.max(input.demand, maxOnboard);
  const capacity = input.capacity && input.capacity > 0 ? input.capacity : null;
  const loadPct = capacity ? Math.round((effective / capacity) * 100) : null;
  return { capacity, demand: input.demand, maxOnboard, effective, loadPct };
}

export type LoadStatus = "overloaded" | "normal" | "low" | "no_data";

export interface LoadThresholds {
  /** Trip is "overloaded" when loadPct >= this (default 100). */
  overloadPct: number;
  /** Route is overloaded when share of overloaded trips >= this (0..1, default 0.3)... */
  overloadShare: number;
  /** ...or average loadPct >= this (default 95). */
  overloadAvgPct: number;
  /** Route is "low" when average loadPct < this (default 40). */
  lowAvgPct: number;
  /** Minimum trips with data to compute a status (default 3). */
  minTrips: number;
}

export const DEFAULT_THRESHOLDS: LoadThresholds = {
  overloadPct: 100,
  overloadShare: 0.3,
  overloadAvgPct: 95,
  lowAvgPct: 40,
  minTrips: 3,
};

export interface RouteLoadStats {
  status: LoadStatus;
  trips: number;
  avgPct: number | null;
  maxPct: number | null;
  avgPassengers: number | null;
  maxPassengers: number | null;
  overloadedTrips: number;
  overloadedShare: number | null;
}

/** Aggregate trip loads into a route status. Trips without capacity are ignored. */
export function routeLoadStatus(
  loads: readonly TripLoad[],
  thresholds: LoadThresholds = DEFAULT_THRESHOLDS,
): RouteLoadStats {
  const withData = loads.filter((l) => l.loadPct !== null) as (TripLoad & { loadPct: number })[];
  const n = withData.length;
  if (n === 0) {
    return {
      status: "no_data",
      trips: 0,
      avgPct: null,
      maxPct: null,
      avgPassengers: null,
      maxPassengers: null,
      overloadedTrips: 0,
      overloadedShare: null,
    };
  }
  const avgPct = Math.round(withData.reduce((s, l) => s + l.loadPct, 0) / n);
  const maxPct = Math.max(...withData.map((l) => l.loadPct));
  const avgPassengers = Math.round((withData.reduce((s, l) => s + l.effective, 0) / n) * 10) / 10;
  const maxPassengers = Math.max(...withData.map((l) => l.effective));
  const overloadedTrips = withData.filter((l) => l.loadPct >= thresholds.overloadPct).length;
  const overloadedShare = overloadedTrips / n;

  let status: LoadStatus;
  if (n < thresholds.minTrips) status = "no_data";
  else if (overloadedShare >= thresholds.overloadShare || avgPct >= thresholds.overloadAvgPct) status = "overloaded";
  else if (avgPct < thresholds.lowAvgPct) status = "low";
  else status = "normal";

  return { status, trips: n, avgPct, maxPct, avgPassengers, maxPassengers, overloadedTrips, overloadedShare };
}

export const LOAD_STATUS_LABEL: Record<LoadStatus, string> = {
  overloaded: "Перегрузка",
  normal: "Нормальная нагрузка",
  low: "Низкая загрузка",
  no_data: "Недостаточно данных",
};
