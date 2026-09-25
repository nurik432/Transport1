/**
 * Walking to a stop: how long it takes and when the passenger should leave.
 * Distances here are straight-line (haversine); streets add a detour.
 */

/** Average walking speed, meters per minute (~4.5 km/h). */
export const WALK_SPEED_M_PER_MIN = 75;
/** Straight line → street distance correction. */
export const WALK_DETOUR_FACTOR = 1.3;

/** Minutes to walk a straight-line distance, rounded up, at least 1. */
export function walkMinutes(straightLineM: number): number {
  if (!Number.isFinite(straightLineM) || straightLineM <= 0) return 1;
  return Math.max(1, Math.ceil((straightLineM * WALK_DETOUR_FACTOR) / WALK_SPEED_M_PER_MIN));
}

export type LeaveHint =
  /** the vehicle is hours away; "when to leave" means nothing yet */
  | { kind: "far"; walkMin: number }
  /** enough time: leave in N minutes */
  | { kind: "wait"; leaveInMin: number; walkMin: number }
  /** leave right now */
  | { kind: "now"; walkMin: number }
  /** the vehicle will arrive before the passenger can walk there */
  | { kind: "late"; walkMin: number; shortByMin: number };

/** Beyond this much slack the hint is not actionable, so it is not given. */
export const LEAVE_HORIZON_MIN = 60;

/**
 * When to leave for the stop, given minutes until arrival and walking time.
 * A 1-minute buffer is kept so the passenger is at the stop before the vehicle.
 */
export function leaveHint(
  etaMinutes: number,
  walkMin: number,
  bufferMin = 1,
  horizonMin = LEAVE_HORIZON_MIN,
): LeaveHint {
  const slack = etaMinutes - walkMin - bufferMin;
  if (slack > horizonMin) return { kind: "far", walkMin };
  if (slack >= 1) return { kind: "wait", leaveInMin: slack, walkMin };
  if (etaMinutes >= walkMin) return { kind: "now", walkMin };
  return { kind: "late", walkMin, shortByMin: walkMin - etaMinutes };
}

/** Free seats, never negative; null when capacity is unknown. */
export function freeSeats(capacity: number | null | undefined, booked: number): number | null {
  if (capacity == null) return null;
  return Math.max(0, capacity - booked);
}
