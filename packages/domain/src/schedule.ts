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

/** Most vehicles one departure time may have. */
export const MAX_VEHICLES_PER_DEPARTURE = 5;

/**
 * How a departure is named to people. One vehicle at that time: just the time.
 * Several: the time and which vehicle it is, so "07:30" never means two things.
 */
export function departureLabel(time: string, vehicleNo: number, vehiclesAtTime: number): string {
  const hhmm = time.slice(0, 5);
  return vehiclesAtTime > 1 ? `${hhmm} · машина ${vehicleNo}` : hhmm;
}

export interface DepartureGroup<T> {
  /** "HH:MM" */
  time: string;
  /** how many vehicles leave at this time */
  vehicles: number;
  /** the schedules of this time, vehicle 1 first */
  schedules: T[];
}

/** Schedules of one route grouped by departure time, earliest first. */
export function groupSchedulesByTime<T extends { departureTime: string; vehicleNo: number }>(
  schedules: readonly T[],
): DepartureGroup<T>[] {
  const byTime = new Map<string, T[]>();
  for (const s of schedules) {
    const time = s.departureTime.slice(0, 5);
    const list = byTime.get(time);
    if (list) list.push(s);
    else byTime.set(time, [s]);
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, list]) => ({
      time,
      vehicles: list.length,
      schedules: [...list].sort((a, b) => a.vehicleNo - b.vehicleNo),
    }));
}

/** How many schedules share each departure time, keyed by "HH:MM". */
export function vehiclesPerTime(schedules: readonly { departureTime: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of schedules) {
    const time = s.departureTime.slice(0, 5);
    counts.set(time, (counts.get(time) ?? 0) + 1);
  }
  return counts;
}
