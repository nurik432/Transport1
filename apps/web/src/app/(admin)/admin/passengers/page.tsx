import { asc, eq, sql } from "drizzle-orm";
import { addDays, localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { PassengerRowActions, PassengersEditor } from "./passengers-editor";

export default async function PassengersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole("admin");
  const { q } = await searchParams;
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
      trips: sql<number>`(
        select count(*) from ${schema.passengerTrips} pt
        join ${schema.trips} t on t.id = pt.trip_id
        where pt.passenger_id = ${schema.passengers.userId} and t.date >= ${since} and pt.status <> 'cancelled'
      )`,
    })
    .from(schema.passengers)
    .innerJoin(schema.users, eq(schema.users.id, schema.passengers.userId))
    .orderBy(asc(schema.users.name));

  const needle = (q ?? "").trim().toLowerCase();
  const passengers = needle
    ? rows.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.phone.includes(needle) ||
          (p.department ?? "").toLowerCase().includes(needle),
      )
    : rows;

  const active = rows.filter((p) => Number(p.trips) > 0).length;

  return (
    <AdminMain>
      <PageHeader
        title="Пассажиры"
        description={`Всего ${rows.length}, ездили за последние 14 дней: ${active}. Пароль выдаёт администратор.`}
      />

      <div className="mb-6 flex flex-col gap-4">
        <PassengersEditor />
        <form className="flex gap-2" action="/admin/passengers">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Поиск по имени, телефону или отделу"
            className="min-h-11 w-full max-w-md rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Найти
          </button>
        </form>
      </div>

      <Table head={["Имя", "Телефон", "Отдел", "Домашний адрес", "Поездок за 14 дней", "Статус", ""]}>
        {passengers.map((p) => (
          <Row key={p.id}>
            <Cell className="font-medium">{p.name}</Cell>
            <Cell className="text-muted-foreground tabular-nums">{p.phone}</Cell>
            <Cell className="text-muted-foreground">{p.department ?? "—"}</Cell>
            <Cell className="max-w-64 truncate text-muted-foreground">{p.homeAddress ?? "—"}</Cell>
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
              />
            </Cell>
          </Row>
        ))}
      </Table>
    </AdminMain>
  );
}
