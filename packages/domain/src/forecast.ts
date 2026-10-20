import type { TripLoadRecord } from "./analytics";
import { weekdayOfDate } from "./time";

/**
 * Demand forecasting from the route's own history.
 *
 * The method is deliberately simple and explainable: a recency-weighted average
 * of comparable past trips. An administrator must be able to see which trips a
 * number came from, so every forecast reports its sample size and grouping.
 */

/** Which past trips the forecast was built from, widest grouping last. */
export type ForecastBasis = "same_time_weekday" | "same_time" | "same_weekday" | "route" | "none";

export const BASIS_LABEL: Record<ForecastBasis, string> = {
  same_time_weekday: "этот рейс в этот день недели",
  same_time: "этот рейс в другие дни",
  same_weekday: "этот день недели",
  route: "весь маршрут",
  none: "нет данных",
};

export type Confidence = "high" | "medium" | "low" | "none";

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
  none: "нет данных",
};

export interface DemandForecast {
  /** recency-weighted average number of passengers */
  expected: number;
  /** lowest and highest number seen in the sample */
  low: number;
  high: number;
  samples: number;
  basis: ForecastBasis;
  confidence: Confidence;
}

export interface ForecastOptions {
  /** weight halves every this many days (default 14) */
  halfLifeDays?: number;
  /** minimum comparable trips before a narrower grouping is accepted (default 3) */
  minSamples?: number;
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.abs(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

function weightedAverage(records: readonly TripLoadRecord[], asOf: string, halfLife: number): number {
  let sum = 0;
  let weight = 0;
  for (const r of records) {
    const w = Math.pow(0.5, daysBetween(r.date, asOf) / halfLife);
    sum += r.effective * w;
    weight += w;
  }
  return weight === 0 ? 0 : sum / weight;
}

function confidenceOf(samples: number, basis: ForecastBasis): Confidence {
  if (basis === "none" || samples === 0) return "none";
  if (basis === "same_time_weekday" && samples >= 5) return "high";
  if (samples >= 5) return "medium";
  if (samples >= 3) return "medium";
  return "low";
}

/**
 * Expected number of passengers for a departure on a future date.
 * Narrows to the closest comparable group that has enough history.
 */
export interface ForecastTarget {
  date: string;
  startTime: string;
  /** the departure of one vehicle; narrows the history to that vehicle when it has some */
  scheduleId?: string | null;
  /** vehicles leaving at this time (default 1); without the vehicle's own history the demand is split between them */
  vehiclesAtTime?: number;
}

/**
 * Past trips of the same departure time, as comparable to the target vehicle.
 * When several vehicles leave together the passengers pick one, so the
 * vehicle's own history is the best guide; a vehicle that has none yet gets an
 * equal share of what the time carried before.
 */
function sameTimeHistory(
  history: readonly TripLoadRecord[],
  target: ForecastTarget,
): { records: TripLoadRecord[]; share: number } {
  const time = target.startTime.slice(0, 5);
  const atTime = history.filter((r) => r.startTime.slice(0, 5) === time);
  if (target.scheduleId) {
    const own = atTime.filter((r) => r.scheduleId === target.scheduleId);
    if (own.length > 0) return { records: own, share: 1 };
  }
  const vehicles = Math.max(1, target.vehiclesAtTime ?? 1);
  // History from days when this time already had several vehicles is per vehicle already.
  const perDay = new Map<string, number>();
  for (const r of atTime) perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);
  const single = atTime.filter((r) => (perDay.get(r.date) ?? 1) === 1);
  if (vehicles > 1 && single.length > 0) return { records: single, share: 1 / vehicles };
  return { records: atTime, share: 1 };
}

export function forecastDemand(
  history: readonly TripLoadRecord[],
  target: ForecastTarget,
  options: ForecastOptions = {},
): DemandForecast {
  const halfLife = options.halfLifeDays ?? 14;
  const minSamples = options.minSamples ?? 3;
  const weekday = weekdayOfDate(target.date);
  const sameTime = sameTimeHistory(history, target);
  const routeShare = 1 / Math.max(1, target.vehiclesAtTime ?? 1);

  const groups: { basis: ForecastBasis; records: TripLoadRecord[]; share: number }[] = [
    { basis: "same_time_weekday", records: sameTime.records.filter((r) => r.weekday === weekday), share: sameTime.share },
    { basis: "same_time", records: sameTime.records, share: sameTime.share },
    { basis: "same_weekday", records: history.filter((r) => r.weekday === weekday), share: routeShare },
    { basis: "route", records: [...history], share: routeShare },
  ];

  const chosen =
    groups.find((g) => g.records.length >= minSamples) ??
    [...groups].reverse().find((g) => g.records.length > 0);
  if (!chosen || chosen.records.length === 0) {
    return { expected: 0, low: 0, high: 0, samples: 0, basis: "none", confidence: "none" };
  }

  const values = chosen.records.map((r) => r.effective);
  const share = chosen.share;
  return {
    expected: Math.round(weightedAverage(chosen.records, target.date, halfLife) * share),
    low: Math.round(Math.min(...values) * share),
    high: Math.round(Math.max(...values) * share),
    samples: chosen.records.length,
    basis: chosen.basis,
    confidence: confidenceOf(chosen.records.length, chosen.basis),
  };
}

export type ForecastRisk = "overflow" | "tight" | "normal" | "low" | "unknown";

export const RISK_LABEL: Record<ForecastRisk, string> = {
  overflow: "Не хватит мест",
  tight: "Возможна нехватка",
  normal: "Норма",
  low: "Низкая загрузка",
  unknown: "Нет прогноза",
};

export interface TripForecast extends DemandForecast {
  tripId: string;
  date: string;
  startTime: string;
  capacity: number | null;
  /** expected passengers as a share of capacity */
  loadPct: number | null;
  /** how many people are expected not to fit, 0 when everyone fits */
  shortfall: number;
  risk: ForecastRisk;
}

export interface RiskThresholds {
  /** expected above this share of capacity means overflow (default 1) */
  overflowRatio: number;
  /** highest observed above capacity means it may overflow (default true) */
  lowRatio: number;
}

export const DEFAULT_RISK: RiskThresholds = { overflowRatio: 1, lowRatio: 0.4 };

/** Attach a forecast and a risk verdict to one upcoming trip. */
export function forecastTrip(
  trip: ForecastTarget & { tripId: string; capacity: number | null },
  history: readonly TripLoadRecord[],
  options: ForecastOptions & { risk?: RiskThresholds } = {},
): TripForecast {
  const forecast = forecastDemand(history, trip, options);
  const thresholds = options.risk ?? DEFAULT_RISK;
  const capacity = trip.capacity && trip.capacity > 0 ? trip.capacity : null;

  let risk: ForecastRisk = "unknown";
  let loadPct: number | null = null;
  let shortfall = 0;

  if (capacity && forecast.basis !== "none") {
    loadPct = Math.round((forecast.expected / capacity) * 100);
    if (forecast.expected > capacity * thresholds.overflowRatio) {
      risk = "overflow";
      shortfall = forecast.expected - capacity;
    } else if (forecast.high > capacity) {
      risk = "tight";
    } else if (forecast.expected < capacity * thresholds.lowRatio) {
      risk = "low";
    } else {
      risk = "normal";
    }
  }

  return {
    ...forecast,
    tripId: trip.tripId,
    date: trip.date,
    startTime: trip.startTime,
    capacity,
    loadPct,
    shortfall,
    risk,
  };
}

export interface PeakHint {
  startTime: string;
  expected: number;
  capacity: number | null;
  shortfall: number;
}

/**
 * Departure times where demand is expected to exceed capacity, worst first.
 * Used to suggest where an extra trip would help most. Vehicles leaving at the
 * same time on the same day count as one departure: their seats add up.
 */
export function peakDepartures(forecasts: readonly TripForecast[]): PeakHint[] {
  // First the departure of each day, all its vehicles together.
  const slots = new Map<string, { startTime: string; expected: number; capacity: number | null; shortfall: number; risky: boolean }>();
  for (const f of forecasts) {
    const key = `${f.date}|${f.startTime}`;
    const cur = slots.get(key) ?? { startTime: f.startTime, expected: 0, capacity: null, shortfall: 0, risky: false };
    cur.expected += f.expected;
    cur.capacity = f.capacity === null ? cur.capacity : (cur.capacity ?? 0) + f.capacity;
    cur.shortfall += f.shortfall;
    cur.risky ||= f.risk === "overflow" || f.risk === "tight";
    slots.set(key, cur);
  }

  // Then the average over the days, per time.
  const byTime = new Map<string, { expected: number; capacity: number | null; shortfall: number; n: number }>();
  for (const slot of slots.values()) {
    if (!slot.risky) continue;
    const cur = byTime.get(slot.startTime) ?? { expected: 0, capacity: slot.capacity, shortfall: 0, n: 0 };
    cur.expected += slot.expected;
    cur.shortfall += slot.shortfall;
    cur.n += 1;
    byTime.set(slot.startTime, cur);
  }
  return [...byTime.entries()]
    .map(([startTime, v]) => ({
      startTime,
      expected: Math.round(v.expected / v.n),
      capacity: v.capacity,
      shortfall: Math.round(v.shortfall / v.n),
    }))
    .sort((a, b) => b.shortfall - a.shortfall || b.expected - a.expected);
}
