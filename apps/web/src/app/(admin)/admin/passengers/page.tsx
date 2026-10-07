import { asc, eq, sql } from "drizzle-orm";
import { addDays, localNow, pauseLabel } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { listRoutes } from "@/lib/queries";
import { listSubscriptions, type SubscriptionRow } from "@/lib/subscriptions";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { PassengerRowActions, PassengersEditor } from "./passengers-editor";
import { RideOptionsProvider, type RideRouteOption } from "./rides-panel";

export default async function PassengersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; schedule?: string }>;
}) {
  await requireRole("admin");
  const { q, schedule } = await searchParams;
  const now = localNow();
  const since = addDays(now.date, -14);

  const rows = await db
    .select({
      id: schema.passengers.userId,
      name: schema.users.name,
      phone: schema.users.phone,
      status: schema.users.status,
      department: schema.passengers.department,
      homeAddress: schema.passengers.homeAddress,
      lat: schema.passengers.lat,
      lng: schema.passengers.lng,
      pauseFrom: schema.passengers.pauseFrom,
      pauseTo: schema.passengers.pauseTo,
      trips: sql<number>`(
        select count(*) from ${schema.passengerTrips} pt
        join ${schema.trips} t on t.id = pt.trip_id
        where pt.passenger_id = ${schema.passengers.userId} and t.date >= ${since} and pt.status <> 'cancelled'
      )`,
    })
    .from(schema.passengers)
    .innerJoin(schema.users, eq(schema.users.id, schema.passengers.userId))
    .orderBy(asc(schema.users.name));

  const [subscriptions, routes] = await Promise.all([listSubscriptions(), listRoutes(true)]);
  const ridesByPassenger = new Map<string, SubscriptionRow[]>();
  for (const s of subscriptions) ridesByPassenger.set(s.passengerId, [...(ridesByPassenger.get(s.passengerId) ?? []), s]);
  const ridersBySchedule = new Map<string, number>();
  for (const s of subscriptions) ridersBySchedule.set(s.scheduleId, (ridersBySchedule.get(s.scheduleId) ?? 0) + 1);

  // The last stop is where everyone gets off, so it is not offered for boarding.
  const rideOptions: RideRouteOption[] = routes.map((r) => ({
    id: r.id,
    name: r.name,
    direction: r.direction,
    departures: r.schedules.filter((s) => s.active).map((s) => ({ scheduleId: s.id, time: s.departureTime })),
    stops: r.stops.slice(0, -1).map((s) => ({ id: s.stopId, name: s.name })),
  }));

  const needle = (q ?? "").trim().toLowerCase();
  const passengers = rows.filter(
    (p) =>
      (!needle ||
        p.name.toLowerCase().includes(needle) ||
        p.phone.includes(needle) ||
        (p.department ?? "").toLowerCase().includes(needle)) &&
      (!schedule || (ridesByPassenger.get(p.id) ?? []).some((s) => s.scheduleId === schedule)),
  );

  const active = rows.filter((p) => Number(p.trips) > 0).length;
  const regular = ridesByPassenger.size;

  return (
    <AdminMain>
      <PageHeader
        title="Пассажиры"
        description={`Всего ${rows.length}, ездили за последние 14 дней: ${active}, с постоянным рейсом: ${regular}. Пароль выдаёт администратор.`}
      />

      <div className="mb-6 flex flex-col gap-4">
        <PassengersEditor />
        <form className="flex flex-wrap gap-2" action="/admin/passengers">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Поиск по имени, телефону или отделу"
            className="min-h-11 w-full max-w-md rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <select
            name="schedule"
            defaultValue={schedule ?? ""}
            aria-label="Постоянный рейс"
            className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          >
            <option value="">Постоянный рейс: любой</option>
            {routes.map((r) => (
              <optgroup key={r.id} label={`${r.name} · ${r.direction === "to_work" ? "утро" : "вечер"}`}>
                {r.schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {r.name} · {s.departureTime} — привязано: {ridersBySchedule.get(s.id) ?? 0}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Найти
          </button>
        </form>
      </div>

      <RideOptionsProvider routes={rideOptions}>
        <Table head={["Имя", "Телефон", "Отдел", "Домашний адрес", "Постоянные рейсы", "Поездок за 14 дней", "Статус", ""]}>
          {passengers.map((p) => {
            const rides = ridesByPassenger.get(p.id) ?? [];
            const pause = rides.length ? pauseLabel({ from: p.pauseFrom, to: p.pauseTo }, now.date) : null;
            return (
              <Row key={p.id}>
                <Cell className="font-medium">{p.name}</Cell>
                <Cell className="text-muted-foreground tabular-nums">{p.phone}</Cell>
                <Cell className="text-muted-foreground">{p.department ?? "—"}</Cell>
                <Cell className="max-w-64 truncate text-muted-foreground">{p.homeAddress ?? "—"}</Cell>
                <Cell className="whitespace-nowrap">
                  {rides.length ? (
                    <span className="flex flex-col py-1.5 leading-snug">
                      {rides.map((s) => (
                        <span key={s.id}>
                          {s.routeName} · {s.departureTime}
                          <span className="text-muted-foreground"> · {s.stopName}</span>
                        </span>
                      ))}
                      {pause ? <span className="text-xs font-medium text-late">{pause}</span> : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Cell>
                <Cell className="tabular-nums">{Number(p.trips)}</Cell>
                <Cell>{p.status === "blocked" ? <span className="text-danger">Заблокирован</span> : "Активен"}</Cell>
                <Cell>
                  <PassengerRowActions
                    id={p.id}
                    name={p.name}
                    phone={p.phone}
                    department={p.department ?? ""}
                    homeAddress={p.homeAddress ?? ""}
                    lat={p.lat}
                    lng={p.lng}
                    status={p.status}
                    rides={rides.map((s) => ({
                      id: s.id,
                      scheduleId: s.scheduleId,
                      direction: s.direction,
                      routeName: s.routeName,
                      departureTime: s.departureTime,
                      stopName: s.stopName,
                    }))}
                  />
                </Cell>
              </Row>
            );
          })}
        </Table>
      </RideOptionsProvider>
    </AdminMain>
  );
}
