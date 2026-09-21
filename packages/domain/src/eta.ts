import type { RouteStopLike } from "./schedule";

export interface StopEventLike {
  stopId: string;
  arrivedAt: Date;
  departedAt?: Date | null;
}

export type EtaSource = "schedule" | "driver";

export interface EtaResult {
  /** Absolute predicted arrival time at the target stop. */
  arrivalAt: Date;
  /** Minutes from `now` (can be negative when already passed). */
  minutesFromNow: number;
  source: EtaSource;
  /** True when the driver already marked the target stop (or a later one). */
  passed: boolean;
}

export interface EtaInput {
  /** Trip start as an absolute Date (date + departure time, local). */
  tripStartAt: Date;
  routeStops: readonly RouteStopLike[];
  events: readonly StopEventLike[];
  targetStopId: string;
  now: Date;
}

const MS_PER_MIN = 60_000;

/**
 * ETA at a stop.
 * - Before any driver marks: schedule (start + offset).
 * - After the driver marked stop j < target: arrived_at_j + (offset_target − offset_j).
 * - If the target (or a later stop) was marked: passed = true.
 */
export function etaForStop(input: EtaInput): EtaResult | null {
  const ordered = [...input.routeStops].sort((a, b) => a.seq - b.seq);
  const target = ordered.find((rs) => rs.stopId === input.targetStopId);
  if (!target) return null;

  const bySeq = new Map(ordered.map((rs) => [rs.stopId, rs]));
  const marked = input.events
    .map((e) => ({ e, rs: bySeq.get(e.stopId) }))
    .filter((x): x is { e: StopEventLike; rs: RouteStopLike } => Boolean(x.rs))
    .sort((a, b) => a.rs.seq - b.rs.seq);
  const last = marked.at(-1);

  const finish = (arrivalAt: Date, source: EtaSource, passed: boolean): EtaResult => ({
    arrivalAt,
    minutesFromNow: Math.round((arrivalAt.getTime() - input.now.getTime()) / MS_PER_MIN),
    source,
    passed,
  });

  if (!last) {
    const arrivalAt = new Date(input.tripStartAt.getTime() + target.offsetMin * MS_PER_MIN);
    return finish(arrivalAt, "schedule", false);
  }

  const atTarget = marked.find((m) => m.rs.stopId === target.stopId);
  if (atTarget) return finish(atTarget.e.arrivedAt, "driver", true);
  if (last.rs.seq > target.seq) {
    // A later stop was marked but the target was not: treat as passed at planned time.
    const arrivalAt = new Date(input.tripStartAt.getTime() + target.offsetMin * MS_PER_MIN);
    return finish(arrivalAt, "driver", true);
  }

  const base = last.e.departedAt ?? last.e.arrivedAt;
  const arrivalAt = new Date(base.getTime() + (target.offsetMin - last.rs.offsetMin) * MS_PER_MIN);
  return finish(arrivalAt, "driver", false);
}

/** "через 7 мин" / "сейчас" / "уже прошёл" */
export function formatEta(r: Pick<EtaResult, "minutesFromNow" | "passed">): string {
  if (r.passed) return "уже прошёл";
  if (r.minutesFromNow <= 0) return "сейчас";
  if (r.minutesFromNow < 60) return `через ${r.minutesFromNow} мин`;
  const h = Math.floor(r.minutesFromNow / 60);
  const m = r.minutesFromNow % 60;
  return m === 0 ? `через ${h} ч` : `через ${h} ч ${m} мин`;
}
