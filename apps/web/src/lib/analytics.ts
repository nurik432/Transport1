import "server-only";
import {
  addDays,
  loadByDepartureTime,
  loadByStop,
  loadByWeekday,
  localNow,
  routeLoadStatus,
  routeSignals,
  type BucketStats,
  type LoadThresholds,
  type RouteLoadStats,
  type RouteSignal,
  type StopLoadStats,
  type TripLoadRecord,
} from "@transport/domain";
import { getStopLoadRecords, getThresholds, getTripLoadRecords, listRoutes } from "./queries";

export const DEFAULT_WINDOW_DAYS = 14;

export interface RouteAnalytics {
  routeId: string;
  routeName: string;
  routeColor: string;
  direction: "to_work" | "from_work";
  description: string | null;
  capacity: number | null;
  stats: RouteLoadStats;
  byTime: BucketStats[];
  byWeekday: BucketStats[];
  byStop: StopLoadStats[];
  signals: RouteSignal[];
  records: TripLoadRecord[];
}

export interface AnalyticsResult {
  from: string;
  to: string;
  thresholds: LoadThresholds;
  routes: RouteAnalytics[];
  signals: RouteSignal[];
}

/** Load, aggregate and interpret trip data for every active route. */
export async function buildAnalytics(days = DEFAULT_WINDOW_DAYS, routeId?: string): Promise<AnalyticsResult> {
  const now = localNow();
  const to = now.date;
  const from = addDays(to, -days);

  const [thresholds, routes, records, stopRecords] = await Promise.all([
    getThresholds(),
    listRoutes(false),
    getTripLoadRecords({ from, to, routeId }),
    getStopLoadRecords({ from, to, routeId }),
  ]);

  const recordsByRoute = new Map<string, TripLoadRecord[]>();
  for (const r of records) {
    const list = recordsByRoute.get(r.routeId);
    if (list) list.push(r);
    else recordsByRoute.set(r.routeId, [r]);
  }
  const tripToRoute = new Map(records.map((r) => [r.tripId, r.routeId]));

  const stopByRoute = new Map<string, typeof stopRecords>();
  for (const s of stopRecords) {
    const rid = tripToRoute.get(s.tripId);
    if (!rid) continue;
    const list = stopByRoute.get(rid);
    if (list) list.push(s);
    else stopByRoute.set(rid, [s]);
  }

  const visible = routes.filter((r) => r.status !== "draft" && (!routeId || r.id === routeId));

  const analytics: RouteAnalytics[] = visible.map((route) => {
    const rec = recordsByRoute.get(route.id) ?? [];
    const stats = routeLoadStatus(rec, thresholds);
    const byTime = loadByDepartureTime(rec, thresholds);
    const byWeekday = loadByWeekday(rec, thresholds);
    const byStop = loadByStop(stopByRoute.get(route.id) ?? []);
    const capacity = rec.find((r) => r.capacity)?.capacity ?? route.plannedCapacity ?? null;
    return {
      routeId: route.id,
      routeName: route.name,
      routeColor: route.color,
      direction: route.direction,
      description: route.description,
      capacity,
      stats,
      byTime,
      byWeekday,
      byStop,
      records: rec,
      signals: routeSignals({ routeId: route.id, routeName: route.name, capacity, stats, byTime, byStop }, thresholds),
    };
  });

  return {
    from,
    to,
    thresholds,
    routes: analytics,
    signals: analytics.flatMap((a) => a.signals),
  };
}

export const DIRECTION_LABEL: Record<"to_work" | "from_work", string> = {
  to_work: "Утро · на работу",
  from_work: "Вечер · домой",
};
