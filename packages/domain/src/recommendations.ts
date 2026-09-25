import type { BucketStats, StopLoadStats } from "./analytics";
import type { LoadThresholds, RouteLoadStats } from "./load";
import { DEFAULT_THRESHOLDS } from "./load";
import { formatMinutes, parseTimeToMinutes } from "./time";

export type SignalKind = "overload" | "low_load";

export interface RouteSignal {
  kind: SignalKind;
  routeId: string;
  routeName: string;
  title: string;
  details: string;
  /** Suggested actions for the administrator (never applied automatically). */
  suggestions: string[];
  severity: "high" | "medium" | "low";
  /** Busiest departure of the route, "HH:MM"; null when nothing stands out. */
  peakTime: string | null;
  /** Departure that would take part of the peak load, "HH:MM". */
  reliefTime: string | null;
  /** Average passengers per trip at the peak departure. */
  peakPassengers: number | null;
}

/** Minutes a relief departure is placed ahead of the peak one. */
export const RELIEF_GAP_MIN = 15;

/**
 * A departure placed shortly before an overloaded one, so part of the queue
 * leaves earlier. Pure clock arithmetic: the administrator decides whether the
 * result fits the schedule.
 */
export function reliefDeparture(peakTime: string, gapMin: number = RELIEF_GAP_MIN): string {
  return formatMinutes(Math.max(0, parseTimeToMinutes(peakTime) - gapMin));
}

export interface RouteSignalInput {
  routeId: string;
  routeName: string;
  capacity: number | null;
  stats: RouteLoadStats;
  byTime: BucketStats[];
  byStop: StopLoadStats[];
}

/** Build human-readable signals for one route. Pure: returns [] when nothing notable. */
export function routeSignals(input: RouteSignalInput, thresholds: LoadThresholds = DEFAULT_THRESHOLDS): RouteSignal[] {
  const out: RouteSignal[] = [];
  const { stats, routeId, routeName, capacity } = input;
  if (stats.status === "no_data") return out;

  if (stats.status === "overloaded") {
    const peaks = input.byTime
      .filter((b) => b.avgPct !== null && b.avgPct >= thresholds.overloadPct)
      .sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0));
    const hot = [...input.byStop].sort((a, b) => b.avgEffective - a.avgEffective).slice(0, 3);
    const peakText = peaks.length ? peaks.map((p) => `${p.label} (${p.avgPct}%)`).join(", ") : "во всех рейсах";
    const hotText = hot.length ? hot.map((s) => `«${s.stopName}» (≈${s.avgEffective} чел.)`).join(", ") : "—";
    const excess =
      capacity && stats.avgPassengers !== null
        ? Math.max(0, Math.round(((stats.avgPassengers - capacity) / capacity) * 100))
        : null;
    const firstPeak = peaks[0];
    out.push({
      kind: "overload",
      routeId,
      routeName,
      severity: "high",
      peakTime: firstPeak?.label ?? null,
      reliefTime: firstPeak ? reliefDeparture(firstPeak.label) : null,
      peakPassengers: firstPeak?.avgPassengers ?? null,
      title: `Маршрут ${routeName}: перегрузка`,
      details:
        `Средняя загрузка ${stats.avgPct}%, максимальная ${stats.maxPct}% ` +
        `(${stats.overloadedTrips} из ${stats.trips} рейсов ≥ ${thresholds.overloadPct}%).` +
        (excess !== null && excess > 0 ? ` Спрос превышает вместимость в среднем на ${excess}%.` : "") +
        ` Пик: ${peakText}. Остановки с наибольшим спросом: ${hotText}.`,
      suggestions: [
        firstPeak ? `Добавить дополнительный рейс рядом с ${firstPeak.label}` : "Добавить дополнительный рейс в пиковое время",
        "Назначить транспорт большей вместимости",
        hot.length >= 2
          ? `Рассмотреть новый маршрут через ${hot
              .slice(0, 2)
              .map((s) => `«${s.stopName}»`)
              .join(" и ")}`
          : "Рассмотреть новый маршрут по району спроса",
      ],
    });
  }

  if (stats.status === "low") {
    out.push({
      kind: "low_load",
      routeId,
      routeName,
      severity: "medium",
      peakTime: null,
      reliefTime: null,
      peakPassengers: null,
      title: `Маршрут ${routeName}: низкая загрузка`,
      details: `Средняя загрузка ${stats.avgPct}% (в среднем ${stats.avgPassengers} чел. при вместимости ${capacity ?? "—"}) за ${stats.trips} рейсов.`,
      suggestions: [
        "Назначить транспорт меньшей вместимости",
        "Сократить число рейсов или объединить с соседним маршрутом",
        "Проверить, есть ли спрос на других остановках района",
      ],
    });
  }

  return out;
}
