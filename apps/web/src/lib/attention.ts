import "server-only";
import { cache } from "react";
import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import { addDays, durationLabel, localNow, plural } from "@transport/domain";
import { db, schema } from "./db";
import { DIRECTION_SHORT, buildAnalytics } from "./analytics";
import { getLiveSignals } from "./live";

/**
 * "Требует решения" — the first thing on the dashboard and the number next to
 * "Дашборд" in the menu. One list, built once per request, so the badge and the
 * cards can never disagree.
 *
 * Every item ends in a button: the screen is read in the ten minutes while the
 * morning trips are running, so a problem without an action is noise.
 */

export interface AttentionAction {
  label: string;
  href: string;
  /** filled button; everything else is a quiet link */
  primary?: boolean;
  /** tel: or another app, opened outside the panel */
  external?: boolean;
}

export type AttentionKind =
  | "overload"
  | "not_started"
  | "off_route"
  | "no_tracking"
  | "unassigned"
  | "route_not_running";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  /** danger — someone is left behind now; warn — a trip needs a nudge */
  tone: "danger" | "warn";
  /** short word on the card, e.g. "Перегрузка" */
  tag: string;
  title: string;
  details: string;
  actions: AttentionAction[];
}

const passengers = (n: number) => `${n} ${plural(n, ["пассажир", "пассажира", "пассажиров"])}`;

/** Trips of today that still have no vehicle or no driver. */
async function countUnassignedToday(date: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(schema.trips)
    .where(
      and(
        eq(schema.trips.date, date),
        eq(schema.trips.status, "planned"),
        or(isNull(schema.trips.vehicleId), isNull(schema.trips.driverId)),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Active routes that carry nobody: no schedule at all, or a schedule that has
 * not been turned into trips.
 *
 * This is the quietest failure in the system — everything looks configured and
 * the passenger simply sees nothing — so it has to be surfaced rather than
 * waited for as a complaint.
 */
async function findRoutesNotRunning(
  fromDate: string,
  toDate: string,
): Promise<{ routeId: string; routeName: string; direction: "to_work" | "from_work"; departures: number }[]> {
  const rows = await db
    .select({
      routeId: schema.routes.id,
      routeName: schema.routes.name,
      direction: schema.routes.direction,
      departures: sql<number>`(
        select count(*) from ${schema.routeSchedules}
        where ${schema.routeSchedules.routeId} = ${schema.routes.id} and ${schema.routeSchedules.active}
      )`,
      trips: sql<number>`(
        select count(*) from ${schema.trips}
        where ${schema.trips.routeId} = ${schema.routes.id}
          and ${schema.trips.status} = 'planned'
          and ${schema.trips.date} between ${fromDate} and ${toDate}
      )`,
    })
    .from(schema.routes)
    .where(eq(schema.routes.status, "active"));

  return rows
    .filter((r) => Number(r.departures) === 0 || Number(r.trips) === 0)
    .map((r) => ({
      routeId: r.routeId,
      routeName: r.routeName,
      direction: r.direction,
      departures: Number(r.departures),
    }));
}

/**
 * Everything the administrator has to decide about right now, most urgent first.
 * Cached per request: the layout uses the length, the dashboard uses the items.
 */
export const getAttention = cache(async (): Promise<AttentionItem[]> => {
  const now = localNow();
  const [analytics, signals, unassigned, notRunning] = await Promise.all([
    buildAnalytics(),
    getLiveSignals(now.instant, now.date),
    countUnassignedToday(now.date),
    findRoutesNotRunning(now.date, addDays(now.date, 13)),
  ]);

  const items: AttentionItem[] = [];

  // 1. Routes that do not fit their passengers: the only thing that leaves
  //    people at the stop, so it goes first.
  for (const route of analytics.routes) {
    for (const s of route.signals) {
      if (s.kind !== "overload") continue;
      const where = `${route.routeName} ${DIRECTION_SHORT[route.direction]}`;
      const seats = route.capacity;
      items.push({
        id: `overload:${route.routeId}`,
        kind: "overload",
        tone: "danger",
        tag: "Перегрузка",
        title: s.peakTime ? `${where}: рейс ${s.peakTime} не вмещает всех` : `${where}: не хватает мест`,
        details:
          (s.peakPassengers !== null && seats
            ? `В среднем ${passengers(Math.round(s.peakPassengers))} на ${seats} ${plural(seats, ["место", "места", "мест"])}`
            : `Средняя загрузка ${route.stats.avgPct}%`) +
          ` — в ${route.stats.overloadedTrips} из ${route.stats.trips} последних рейсов.`,
        actions: [
          s.reliefTime
            ? {
                label: `Добавить рейс ${s.reliefTime}`,
                href: `/admin/routes/${route.routeId}?departure=${s.reliefTime}#schedule`,
                primary: true,
              }
            : { label: "Открыть расписание", href: `/admin/routes/${route.routeId}#schedule`, primary: true },
          {
            label: "Разбор",
            href: `/admin/analytics?route=${route.routeId}${s.peakTime ? `&time=${s.peakTime}` : ""}`,
          },
        ],
      });
    }
  }

  // 2. Live signals about today: a trip that never left, a vehicle off the line,
  //    a vehicle that stopped reporting.
  for (const s of signals) {
    const where = s.routeName;
    if (s.kind === "not_started") {
      items.push({
        id: `not_started:${s.tripId}`,
        kind: "not_started",
        tone: "warn",
        tag: "Не начат",
        title: `${where} рейс ${s.startTime} не выехал`,
        details:
          `Прошло ${durationLabel(s.lateMin ?? 0)}. ${s.driverName ? `Водитель ${s.driverName}` : "Водитель"} не нажал «Начать рейс»` +
          (s.booked > 0 ? `, записались ${s.booked}.` : "."),
        actions: [
          s.driverPhone
            ? { label: "Позвонить водителю", href: `tel:${s.driverPhone}`, primary: true, external: true }
            : { label: "Открыть рейс", href: `/admin/trips?date=${now.date}`, primary: true },
          { label: "Рейс", href: `/admin/trips?date=${now.date}` },
        ],
      });
    } else if (s.kind === "off_route") {
      items.push({
        id: `off_route:${s.tripId}`,
        kind: "off_route",
        tone: "warn",
        tag: "Отклонение",
        title: `${where} в ${s.offRouteM} м от линии маршрута`,
        details:
          `Рейс ${s.startTime}` +
          (s.silentSec !== null ? `, GPS обновлён ${s.silentSec} с назад.` : ", данных GPS нет.") +
          (s.driverName ? ` Водитель ${s.driverName}.` : ""),
        actions: [{ label: "Показать на карте", href: `/admin/live?trip=${s.tripId}`, primary: true }],
      });
    } else {
      items.push({
        id: `no_tracking:${s.tripId}`,
        kind: "no_tracking",
        tone: "warn",
        tag: "Нет GPS",
        title: `${where} рейс ${s.startTime} не передаёт координаты`,
        details: s.details,
        actions: [{ label: "Показать на карте", href: `/admin/live?trip=${s.tripId}`, primary: true }],
      });
    }
  }

  // 3. Trips of today nobody is driving yet.
  if (unassigned > 0) {
    items.push({
      id: "unassigned",
      kind: "unassigned",
      tone: "warn",
      tag: "Без назначения",
      title: `${unassigned} ${plural(unassigned, ["рейс", "рейса", "рейсов"])} без транспорта или водителя`,
      details: "Рейсы на сегодня, которым ещё не назначен транспорт или водитель.",
      actions: [{ label: "Назначить", href: `/admin/trips?date=${now.date}&filter=unassigned`, primary: true }],
    });
  }

  // 4. Active routes that will not carry anybody: no schedule, or no trips made
  //    from it. Nothing else reports this, and the passenger just sees nothing.
  for (const route of notRunning) {
    const where = `${route.routeName} ${DIRECTION_SHORT[route.direction]}`;
    items.push({
      id: `route_not_running:${route.routeId}`,
      kind: "route_not_running",
      tone: "warn",
      tag: "Не поедет",
      title: `${where}: маршрут активен, но рейсов нет`,
      details:
        route.departures === 0
          ? "В расписании нет ни одного отправления, поэтому рейсы не создаются."
          : "Расписание есть, но рейсы на ближайшие две недели не сгенерированы.",
      actions: [{ label: "Открыть маршрут", href: `/admin/routes/${route.routeId}`, primary: true }],
    });
  }

  return items;
});

/** Number shown next to "Дашборд" in the menu. */
export const getAttentionCount = cache(async (): Promise<number> => (await getAttention()).length);
