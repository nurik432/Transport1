import { parseTimeToMinutes } from "./time";

export type Direction = "to_work" | "from_work";

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(d: Date): number {
  const w = d.getDay();
  return w === 0 ? 7 : w;
}

/** Morning (before noon) → to_work, otherwise from_work. */
export function directionForMinutes(minutesSinceMidnight: number): Direction {
  return minutesSinceMidnight < 12 * 60 ? "to_work" : "from_work";
}

export interface RouteStopLike {
  stopId: string;
  seq: number;
  offsetMin: number;
}

export interface PlannedStopTime {
  stopId: string;
  seq: number;
  plannedMin: number; // minutes since midnight
}

/** Planned time at each stop for a departure at `departureMin`. */
export function plannedStopTimes(departureMin: number, routeStops: readonly RouteStopLike[]): PlannedStopTime[] {
  return [...routeStops]
    .sort((a, b) => a.seq - b.seq)
    .map((rs) => ({ stopId: rs.stopId, seq: rs.seq, plannedMin: departureMin + rs.offsetMin }));
}

export interface ScheduleLike {
  id: string;
  routeId: string;
  departureTime: string; // "HH:MM" or "HH:MM:SS"
  daysOfWeek: readonly number[];
  active: boolean;
}

/** Whether a schedule runs on the given ISO weekday. */
export function scheduleRunsOn(s: ScheduleLike, weekday: number): boolean {
  return s.active && s.daysOfWeek.includes(weekday);
}

export interface UpcomingDeparture {
  schedule: ScheduleLike;
  departureMin: number;
}

/**
 * Departures for a weekday at or after `fromMin`, sorted by time.
 * Does not roll over to the next day; callers decide what to show when the list is empty.
 */
export function upcomingDepartures(
  schedules: readonly ScheduleLike[],
  weekday: number,
  fromMin: number,
  limit = 3,
): UpcomingDeparture[] {
  return schedules
    .filter((s) => scheduleRunsOn(s, weekday))
    .map((schedule) => ({ schedule, departureMin: parseTimeToMinutes(schedule.departureTime) }))
    .filter((d) => d.departureMin >= fromMin)
    .sort((a, b) => a.departureMin - b.departureMin)
    .slice(0, limit);
}
