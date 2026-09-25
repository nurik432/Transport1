import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { addDays, formatLocalDate, localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { AdminMain, Cell, FilterChips, PageHeader, Row, Table, type FilterChip } from "@/components/admin-ui";
import { MiniBar, Pill, RouteBadge } from "@/components/ui";
import { DIRECTION_SHORT } from "@/lib/analytics";
import { forecastByTrip } from "@/lib/planning";
import { GenerateTripsForm, TripAssignment, TripRowActions } from "./trips-editor";

const STATUS: Record<string, { label: string; tone: "neutral" | "primary" | "ok" | "warn" }> = {
  planned: { label: "Запланирован", tone: "neutral" },
  in_progress: { label: "В пути", tone: "primary" },
  completed: { label: "Завершён", tone: "ok" },
  cancelled: { label: "Отменён", tone: "warn" },
};

type Filter = "all" | "unassigned" | "in_progress" | "planned" | "completed";

const FILTERS: Filter[] = ["all", "unassigned", "in_progress", "planned", "completed"];
const FILTER_LABEL: Record<Filter, string> = {
  all: "Все",
  unassigned: "Не назначены",
  in_progress: "В пути",
  planned: "Запланированы",
  completed: "Завершены",
};

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; filter?: string }>;
}) {
  await requireRole("admin");
  const now = localNow();
  const { date, filter } = await searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date! : now.date;
  const active: Filter = FILTERS.includes(filter as Filter) ? (filter as Filter) : "all";

  const [trips, vehicles, drivers, routes] = await Promise.all([
    db
      .select({
        id: schema.trips.id,
        startTime: schema.trips.startTime,
        status: schema.trips.status,
        routeId: schema.routes.id,
        routeName: schema.routes.name,
        routeColor: schema.routes.color,
        routeDescription: schema.routes.description,
        direction: schema.routes.direction,
        vehicleId: schema.trips.vehicleId,
        vehicleNumber: schema.vehicles.number,
        capacity: schema.vehicles.capacity,
        driverId: schema.trips.driverId,
        driverName: schema.users.name,
        booked: sql<number>`(select count(*) from ${schema.passengerTrips} pt where pt.trip_id = ${schema.trips.id} and pt.status <> 'cancelled')`,
      })
      .from(schema.trips)
      .innerJoin(schema.routes, eq(schema.routes.id, schema.trips.routeId))
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.trips.vehicleId))
      .leftJoin(schema.users, eq(schema.users.id, schema.trips.driverId))
      .where(eq(schema.trips.date, day))
      .orderBy(asc(schema.trips.startTime), asc(schema.routes.name)),
    db
      .select({
        id: schema.vehicles.id,
        number: schema.vehicles.number,
        model: schema.vehicles.model,
      })
      .from(schema.vehicles)
      .where(eq(schema.vehicles.status, "active"))
      .orderBy(asc(schema.vehicles.number)),
    db
      .select({ id: schema.drivers.userId, name: schema.users.name })
      .from(schema.drivers)
      .innerJoin(schema.users, eq(schema.users.id, schema.drivers.userId))
      .where(and(eq(schema.drivers.status, "active"), eq(schema.users.status, "active")))
      .orderBy(asc(schema.users.name)),
    db
      .select({
        id: schema.routes.id,
        name: schema.routes.name,
        direction: schema.routes.direction,
      })
      .from(schema.routes)
      .where(eq(schema.routes.status, "active"))
      .orderBy(asc(schema.routes.name)),
  ]);

  const forecasts = await forecastByTrip(day);
  const isUnassigned = (t: (typeof trips)[number]) =>
    t.status !== "cancelled" && t.status !== "completed" && (!t.vehicleId || !t.driverId);

  const counts: Record<Filter, number> = {
    all: trips.length,
    unassigned: trips.filter(isUnassigned).length,
    in_progress: trips.filter((t) => t.status === "in_progress").length,
    planned: trips.filter((t) => t.status === "planned").length,
    completed: trips.filter((t) => t.status === "completed").length,
  };

  const shown = trips.filter((t) => {
    if (active === "all") return true;
    if (active === "unassigned") return isUnassigned(t);
    return t.status === active;
  });

  const chips: FilterChip[] = FILTERS.map((key) => ({
    key,
    label: FILTER_LABEL[key],
    count: counts[key],
    href: `/admin/trips?date=${day}${key === "all" ? "" : `&filter=${key}`}`,
    attention: key === "unassigned" && counts.unassigned > 0,
  }));

  const dayHref = (d: string) => `/admin/trips?date=${d}${active === "all" ? "" : `&filter=${active}`}`;

  return (
    <AdminMain>
      <PageHeader
        title="Рейсы"
        description="Назначение транспорта и водителей на день"
        action={
          <>
            <div className="flex items-center rounded-[10px] border border-border bg-card">
              <Link
                href={dayHref(addDays(day, -1))}
                aria-label="Предыдущий день"
                className="flex size-10 items-center justify-center text-lg hover:bg-muted"
              >
                ‹
              </Link>
              <span className="px-2.5 text-sm font-bold">
                {formatLocalDate(day, {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                })}
              </span>
              <Link
                href={dayHref(addDays(day, 1))}
                aria-label="Следующий день"
                className="flex size-10 items-center justify-center text-lg hover:bg-muted"
              >
                ›
              </Link>
            </div>
            {day === now.date ? null : (
              <Link href={dayHref(now.date)} className="text-sm font-semibold text-primary hover:underline">
                Сегодня
              </Link>
            )}
            <GenerateTripsForm
              routeOptions={routes.map((r) => ({
                value: r.id,
                label: `${r.name} · ${DIRECTION_SHORT[r.direction]}`,
              }))}
              defaultFrom={now.date}
              defaultTo={addDays(now.date, 7)}
            />
          </>
        }
      />

      <FilterChips chips={chips} active={active} label="Фильтр рейсов" />

      {shown.length === 0 ? (
        <p className="rounded-[--radius-panel] bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {trips.length === 0 ? "На эту дату рейсов нет. Создайте их из расписания." : "В этой группе рейсов нет."}
        </p>
      ) : (
        <Table
          minWidth="62rem"
          head={["Время", "Маршрут", "Транспорт и водитель", "Записались", "Прогноз", "Статус", ""]}
        >
          {shown.map((t) => {
            const unassigned = isUnassigned(t);
            const forecast = forecasts.get(t.id);
            const overflow = forecast && t.capacity ? forecast.expected > t.capacity : false;
            return (
              <Row key={t.id} tone={unassigned ? "attention" : "plain"}>
                <Cell className="w-20 font-bold tabular-nums">{t.startTime.slice(0, 5)}</Cell>
                <Cell className="w-64 max-w-64">
                  <span className="flex min-w-0 items-center gap-2">
                    <RouteBadge name={t.routeName} color={t.routeColor} />
                    <span className="truncate" title={t.routeDescription ?? undefined}>
                      {t.routeDescription ?? DIRECTION_SHORT[t.direction]}
                    </span>
                  </span>
                </Cell>
                <Cell>
                  <TripAssignment
                    tripId={t.id}
                    vehicleId={t.vehicleId ?? ""}
                    driverId={t.driverId ?? ""}
                    vehicleLabel={t.vehicleNumber}
                    driverLabel={t.driverName}
                    disabled={t.status === "completed" || t.status === "cancelled"}
                    vehicleOptions={vehicles.map((v) => ({
                      value: v.id,
                      label: `${v.number} · ${v.model}`,
                    }))}
                    driverOptions={drivers.map((d) => ({
                      value: d.id,
                      label: d.name,
                    }))}
                  />
                </Cell>
                <Cell className="w-48 text-sm">
                  {t.capacity ? (
                    <MiniBar value={Number(t.booked)} of={t.capacity} />
                  ) : (
                    <span className="tabular-nums">{Number(t.booked)} записались</span>
                  )}
                </Cell>
                <Cell className="w-28 tabular-nums">
                  {!forecast || forecast.basis === "none" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={overflow ? "font-bold text-danger-foreground" : "text-muted-foreground"}>
                      {forecast.expected}
                      {overflow ? " ▲" : ""}
                    </span>
                  )}
                </Cell>
                <Cell className="w-36">
                  {unassigned ? (
                    <Pill tone="warn">Не назначен</Pill>
                  ) : (
                    <Pill tone={STATUS[t.status]?.tone ?? "neutral"}>{STATUS[t.status]?.label ?? t.status}</Pill>
                  )}
                </Cell>
                <Cell className="w-28">
                  {t.status === "planned" || t.status === "in_progress" ? (
                    <TripRowActions tripId={t.id} time={t.startTime.slice(0, 5)} routeName={t.routeName} />
                  ) : null}
                </Cell>
              </Row>
            );
          })}
        </Table>
      )}

      <p className="text-[13px] text-muted-foreground">
        Прогноз — ожидаемое число пассажиров по истории поездок. ▲ — прогноз больше вместимости назначенного транспорта.
      </p>
    </AdminMain>
  );
}
