import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { addDays, formatLocalDate, localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { RouteBadge, cx } from "@/components/ui";
import { GenerateTripsForm, TripAssignment, TripRowActions } from "./trips-editor";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  planned: { label: "Запланирован", cls: "text-muted-foreground" },
  in_progress: { label: "В пути", cls: "text-primary font-medium" },
  completed: { label: "Завершён", cls: "text-green-700" },
  cancelled: { label: "Отменён", cls: "text-danger" },
};

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireRole("admin");
  const now = localNow();
  const { date } = await searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date! : now.date;

  const [trips, vehicles, drivers, routes] = await Promise.all([
    db
      .select({
        id: schema.trips.id,
        startTime: schema.trips.startTime,
        status: schema.trips.status,
        routeId: schema.routes.id,
        routeName: schema.routes.name,
        routeColor: schema.routes.color,
        direction: schema.routes.direction,
        vehicleId: schema.trips.vehicleId,
        vehicleNumber: schema.vehicles.number,
        capacity: schema.vehicles.capacity,
        driverId: schema.trips.driverId,
        booked: sql<number>`(select count(*) from ${schema.passengerTrips} pt where pt.trip_id = ${schema.trips.id} and pt.status <> 'cancelled')`,
      })
      .from(schema.trips)
      .innerJoin(schema.routes, eq(schema.routes.id, schema.trips.routeId))
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.trips.vehicleId))
      .where(eq(schema.trips.date, day))
      .orderBy(asc(schema.trips.startTime), asc(schema.routes.name)),
    db
      .select({ id: schema.vehicles.id, number: schema.vehicles.number, model: schema.vehicles.model })
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
      .select({ id: schema.routes.id, name: schema.routes.name, direction: schema.routes.direction })
      .from(schema.routes)
      .where(eq(schema.routes.status, "active"))
      .orderBy(asc(schema.routes.name)),
  ]);

  const unassigned = trips.filter((t) => !t.vehicleId || !t.driverId).length;

  return (
    <AdminMain>
      <PageHeader
        title="Рейсы"
        description={`${formatLocalDate(day, { weekday: "long", day: "numeric", month: "long" })} · всего ${trips.length}${unassigned ? `, без назначения ${unassigned}` : ""}`}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[-1, 0, 1, 2].map((offset) => {
              const d = addDays(now.date, offset);
              return (
                <Link
                  key={d}
                  href={`/admin/trips?date=${d}`}
                  className={cx(
                    "min-h-10 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    d === day ? "border-primary bg-primary-soft text-primary" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {offset === 0 ? "Сегодня" : formatLocalDate(d, { day: "numeric", month: "short" })}
                </Link>
              );
            })}
          </div>
          <form action="/admin/trips" className="flex gap-2">
            <input
              type="date"
              name="date"
              defaultValue={day}
              className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="min-h-11 cursor-pointer rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Показать
            </button>
          </form>
        </div>

        <GenerateTripsForm
          routeOptions={routes.map((r) => ({
            value: r.id,
            label: `${r.name} · ${r.direction === "to_work" ? "утро" : "вечер"}`,
          }))}
          defaultFrom={now.date}
          defaultTo={addDays(now.date, 7)}
        />
      </div>

      <Table head={["Время", "Маршрут", "Транспорт и водитель", "Записались", "Статус", ""]}>
        {trips.map((t) => (
          <Row key={t.id}>
            <Cell className="font-medium tabular-nums">{t.startTime.slice(0, 5)}</Cell>
            <Cell>
              <span className="inline-flex items-center gap-2">
                <RouteBadge name={t.routeName} color={t.routeColor} />
                <span className="text-muted-foreground">{t.direction === "to_work" ? "утро" : "вечер"}</span>
              </span>
            </Cell>
            <Cell>
              <TripAssignment
                tripId={t.id}
                vehicleId={t.vehicleId ?? ""}
                driverId={t.driverId ?? ""}
                disabled={t.status === "completed" || t.status === "cancelled"}
                vehicleOptions={vehicles.map((v) => ({ value: v.id, label: `${v.number} · ${v.model}` }))}
                driverOptions={drivers.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Cell>
            <Cell className="tabular-nums">
              {Number(t.booked)}
              {t.capacity ? <span className="text-muted-foreground"> / {t.capacity}</span> : null}
            </Cell>
            <Cell className={STATUS_LABEL[t.status]?.cls}>{STATUS_LABEL[t.status]?.label}</Cell>
            <Cell>
              {t.status === "planned" || t.status === "in_progress" ? (
                <TripRowActions tripId={t.id} time={t.startTime.slice(0, 5)} routeName={t.routeName} />
              ) : null}
            </Cell>
          </Row>
        ))}
      </Table>

      {trips.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          На эту дату рейсов нет. Сгенерируйте их из расписания маршрутов.
        </p>
      ) : null}
    </AdminMain>
  );
}
