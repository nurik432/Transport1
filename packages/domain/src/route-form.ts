/**
 * Rules for the route form: what blocks saving, what only deserves a warning,
 * and what is still left to do before the route actually carries passengers.
 *
 * This is the single source of these rules. The wizard, the flat edit page and
 * `saveRoute` on the server all call the same functions, so a rule cannot hold
 * in one place and be missing in another. Keep it free of frameworks: no zod,
 * no React, no database — zod still guards shapes and types at the edge.
 */

import { plural } from "./plural";

/** Highest number of points the road router accepts in one request. */
export const MAX_ROUTE_POINTS = 25;
/** A stop cannot sit further than this from the departure time. */
export const MAX_OFFSET_MIN = 600;

export interface RouteFormPoint {
  /** null while the point only exists on the map; the stop is created on save */
  stopId: string | null;
  name: string;
  lat: number;
  lng: number;
  offsetMin: number;
}

export interface RouteFormInput {
  name: string;
  direction: "to_work" | "from_work";
  status: "draft" | "active" | "inactive";
  color: string;
  /** null means "not set": the trip then falls back to the vehicle capacity */
  plannedCapacity: number | null;
  stops: readonly RouteFormPoint[];
  departures: readonly string[];
  daysOfWeek: readonly number[];
}

export interface RouteFormProblems {
  /** keyed by form field: "name", "stops", "stops.2.offsetMin", "departures.0" */
  errors: Record<string, string>;
  /** worth saying out loud, but the administrator may have meant it */
  warnings: Record<string, string>;
}

const TIME_RE = /^\d{2}:\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isValidTime(t: string): boolean {
  if (!TIME_RE.test(t)) return false;
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h <= 23 && m <= 59;
}

/**
 * Every problem with the form at once, so the screen can mark each field
 * instead of showing one message at a time.
 */
export function validateRouteForm(input: RouteFormInput): RouteFormProblems {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (!input.name.trim()) errors.name = "Укажите номер маршрута";
  if (!COLOR_RE.test(input.color)) errors.color = "Цвет должен быть в формате #RRGGBB";

  if (input.plannedCapacity !== null) {
    const c = input.plannedCapacity;
    if (!Number.isInteger(c) || c < 0 || c > 200) {
      errors.plannedCapacity = "Вместимость — целое число от 0 до 200";
    }
  }

  // ------------------------------------------------------------------ stops
  if (input.stops.length < 2) {
    errors.stops = "В маршруте должно быть минимум две остановки";
  } else if (input.stops.length > MAX_ROUTE_POINTS) {
    errors.stops = `Больше ${MAX_ROUTE_POINTS} остановок в одном маршруте не поддерживается`;
  }

  const seen = new Map<string, number>();
  input.stops.forEach((stop, i) => {
    // Only a point that is about to become a stop needs a name from the form.
    // An existing stop is named in the directory; the form just carries a label.
    if (stop.stopId === null && !stop.name.trim()) {
      errors[`stops.${i}.name`] = "Укажите название остановки";
    }

    if (!Number.isInteger(stop.offsetMin) || stop.offsetMin < 0 || stop.offsetMin > MAX_OFFSET_MIN) {
      errors[`stops.${i}.offsetMin`] = `Время — целое число минут от 0 до ${MAX_OFFSET_MIN}`;
    }

    if (stop.stopId) {
      const first = seen.get(stop.stopId);
      if (first === undefined) seen.set(stop.stopId, i);
      else errors[`stops.${i}.stopId`] = `Остановка «${stop.name}» уже стоит в маршруте под номером ${first + 1}`;
    }

    // Not an error: existing routes may already look like this, and making it
    // one would lock them out of editing. But the arrival-time maths assumes
    // the offsets grow along the route, so it must not pass unnoticed.
    const previous = input.stops[i - 1];
    if (previous && stop.offsetMin < previous.offsetMin) {
      warnings[`stops.${i}.offsetMin`] = "Время меньше, чем на предыдущей остановке";
    }
  });

  // ------------------------------------------------------------- departures
  const times = new Set<string>();
  input.departures.forEach((t, i) => {
    if (!isValidTime(t)) errors[`departures.${i}`] = "Время в формате ЧЧ:ММ";
    else if (times.has(t)) errors[`departures.${i}`] = `Отправление ${t} уже добавлено`;
    times.add(t);
  });

  // A departure with no weekday never produces a trip, so it is a dead entry
  // rather than a draft still being filled in.
  if (input.departures.length > 0 && input.daysOfWeek.length === 0) {
    errors.daysOfWeek = "Отметьте хотя бы один день недели, иначе рейсы не создадутся";
  }

  return { errors, warnings };
}

/** Which form fields belong to which wizard step. */
const STEP_FIELDS: readonly (readonly string[])[] = [
  ["name", "color", "plannedCapacity"],
  ["stops"],
  ["departures", "daysOfWeek"],
  [],
];

export type RouteFormStep = 0 | 1 | 2 | 3;

/**
 * Why "Далее" is not available on this step, in plain Russian.
 * The screen shows this list next to the button: a disabled button is only
 * unfair when the reason is hidden.
 */
export function routeStepBlockers(step: RouteFormStep, input: RouteFormInput): string[] {
  const { errors } = validateRouteForm(input);
  const fields = STEP_FIELDS[step] ?? [];
  const reasons: string[] = [];
  for (const [key, message] of Object.entries(errors)) {
    const root = key.split(".")[0] as string;
    if (fields.includes(root) && !reasons.includes(message)) reasons.push(message);
  }
  return reasons;
}

/** Nothing on this step is left to fix. */
export function canLeaveStep(step: RouteFormStep, input: RouteFormInput): boolean {
  return routeStepBlockers(step, input).length === 0;
}

/** The first step that still has a problem, or the last step when the form is complete. */
export function firstIncompleteStep(input: RouteFormInput): RouteFormStep {
  for (const step of [0, 1, 2] as const) if (!canLeaveStep(step, input)) return step;
  return 3;
}

/**
 * The parts of the form that decide whether anything meaningful changed, as one
 * comparable string. Local ids and manual-offset flags are deliberately left
 * out: they never reach the database.
 */
export function normalizeRouteForm(input: RouteFormInput): string {
  const stops = input.stops
    .map((s) => `${s.stopId ?? `new:${s.lat.toFixed(5)},${s.lng.toFixed(5)}`}@${s.offsetMin}`)
    .join(">");
  const departures = [...input.departures].sort().join(",");
  const days = [...input.daysOfWeek].sort((a, b) => a - b).join(",");
  return [
    input.name.trim(),
    input.direction,
    input.status,
    input.color.toLowerCase(),
    input.plannedCapacity ?? "",
    stops,
    departures,
    days,
  ].join("|");
}

/** Only the shape: the stops, their order and their offsets. */
export function normalizeRouteShape(stops: readonly RouteFormPoint[]): string {
  return stops.map((s) => `${s.stopId ?? `new:${s.lat.toFixed(5)},${s.lng.toFixed(5)}`}@${s.offsetMin}`).join(">");
}

// ------------------------------------------------------------------ readiness

export interface RouteReadinessInput {
  status: "draft" | "active" | "inactive";
  stopCount: number;
  departureCount: number;
  daysOfWeek: readonly number[];
  /** planned trips of this route from today onwards */
  plannedTripCount: number;
  /** of those, trips still missing a vehicle or a driver */
  unassignedTripCount: number;
  /** whether the fleet has any usable vehicle at all */
  hasVehicles: boolean;
  /** the form in the browser differs from what is stored */
  dirty: boolean;
}

export type ReadinessKey = "stops" | "departures" | "saved" | "status" | "trips" | "crew";

export interface ReadinessStep {
  key: ReadinessKey;
  done: boolean;
  title: string;
  /** what to do about it; shown while it is not done */
  hint: string;
}

/**
 * What is still missing before passengers see this route, in the order an
 * administrator works through it. Every unfinished item names its own fix:
 * "the route is active but nobody is riding" has too many causes to guess at,
 * and it is the question the FAQ gets asked most.
 */
export function routeReadiness(input: RouteReadinessInput): ReadinessStep[] {
  const hasSchedule = input.departureCount > 0 && input.daysOfWeek.length > 0;

  return [
    {
      key: "stops",
      done: input.stopCount >= 2,
      title: "Минимум две остановки",
      hint: "Поставьте точки на карте: откуда забираем и куда привозим.",
    },
    {
      key: "departures",
      done: hasSchedule,
      title: "Время отправления и дни недели",
      hint:
        input.departureCount === 0
          ? "Добавьте хотя бы одно время отправления."
          : "Отметьте дни недели, иначе рейсы не создадутся.",
    },
    {
      key: "saved",
      // Nothing below can be true while the browser holds unsaved changes:
      // trip generation reads the database, not the form.
      done: !input.dirty,
      title: "Изменения сохранены",
      hint: "Сохраните маршрут — рейсы создаются из сохранённого расписания.",
    },
    {
      key: "status",
      done: input.status === "active",
      title: "Маршрут активен",
      hint:
        input.status === "draft"
          ? "Черновик не попадает в генерацию рейсов и не виден пассажирам."
          : "Отключённый маршрут не виден пассажирам.",
    },
    {
      key: "trips",
      done: input.plannedTripCount > 0,
      title: "Рейсы созданы",
      hint: "Расписание само рейсы не создаёт — сгенерируйте их на ближайшие дни.",
    },
    {
      key: "crew",
      done: input.plannedTripCount > 0 && input.unassignedTripCount === 0,
      title: "Транспорт и водитель назначены",
      hint: !input.hasVehicles
        ? "В парке нет активного транспорта — добавьте машину в справочнике."
        : input.plannedTripCount === 0
          ? "Назначать некому: сначала создайте рейсы."
          : `Без назначения ${input.unassignedTripCount} ${plural(input.unassignedTripCount, ["рейс", "рейса", "рейсов"])}: водитель такой рейс не увидит.`,
    },
  ];
}

/** Items the administrator still has to deal with. */
export function pendingReadiness(steps: readonly ReadinessStep[]): ReadinessStep[] {
  return steps.filter((s) => !s.done);
}

// --------------------------------------------------------- suggested offsets

export interface OffsetTarget {
  offsetMin: number;
  /** the administrator typed this one; a recalculation must leave it alone */
  offsetManual: boolean;
}

/**
 * Apply times computed from the road path, keeping anything typed by hand.
 * Without the flag an automatic recalculation would silently undo the
 * administrator's own corrections.
 */
export function applySuggestedOffsets<T extends OffsetTarget>(
  points: readonly T[],
  suggested: readonly number[],
): T[] {
  return points.map((p, i) => {
    const next = suggested[i];
    if (p.offsetManual || next === undefined || next === p.offsetMin) return p;
    return { ...p, offsetMin: next };
  });
}

/** Planned arrival minute at each stop for a departure, for the review table. */
export function stopArrivalMinutes(departureMin: number, stops: readonly RouteFormPoint[]): number[] {
  return stops.map((s) => departureMin + s.offsetMin);
}
