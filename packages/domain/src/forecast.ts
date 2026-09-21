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
export function forecastDemand(
  history: readonly TripLoadRecord[],
  target: { date: string; startTime: string },
  options: ForecastOptions = {},
): DemandForecast {
  const halfLife = options.halfLifeDays ?? 14;
  const minSamples = options.minSamples ?? 3;
  const weekday = weekdayOfDate(target.date);
  const time = target.startTime.slice(0, 5);

  const groups: { basis: ForecastBasis; records: TripLoadRecord[] }[] = [
    { basis: "same_time_weekday", records: history.filter((r) => r.startTime.slice(0, 5) === time && r.weekday === weekday) },
    { basis: "same_time", records: history.filter((r) => r.startTime.slice(0, 5) === time) },
    { basis: "same_weekday", records: history.filter((r) => r.weekday === weekday) },
    { basis: "route", records: [...history] },
  ];

  const chosen =
    groups.find((g) => g.records.length >= minSamples) ??
    [...groups].reverse().find((g) => g.records.length > 0);
  if (!chosen || chosen.records.length === 0) {
    return { expected: 0, low: 0, high: 0, samples: 0, basis: "none", confidence: "none" };
  }

  const values = chosen.records.map((r) => r.effective);
  return {
    expected: Math.round(weightedAverage(chosen.records, target.date, halfLife)),
    low: Math.min(...values),
    high: Math.max(...values),
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
  trip: { tripId: string; date: string; startTime: string; capacity: number | null },
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

  return { ...forecast, ...trip, capacity, loadPct, shortfall, risk };
}

export interface PeakHint {
  startTime: string;
  expected: number;
  capacity: number | null;
  shortfall: number;
}

/**
 * Departure times where demand is expected to exceed capacity, worst first.
 * Used to suggest where an extra trip would help most.
 */
export function peakDepartures(forecasts: readonly TripForecast[]): PeakHint[] {
  const byTime = new Map<string, { expected: number; capacity: number | null; shortfall: number; n: number }>();
  for (const f of forecasts) {
    if (f.risk !== "overflow" && f.risk !== "tight") continue;
    const cur = byTime.get(f.startTime) ?? { expected: 0, capacity: f.capacity, shortfall: 0, n: 0 };
    cur.expected += f.expected;
    cur.shortfall += f.shortfall;
    cur.n += 1;
    byTime.set(f.startTime, cur);
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
