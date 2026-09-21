import { asc, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { DriverRowActions, DriversEditor } from "./drivers-editor";

export default async function DriversPage() {
  await requireRole("admin");

  const [drivers, vehicles] = await Promise.all([
    db
      .select({
        id: schema.drivers.userId,
        name: schema.users.name,
        phone: schema.users.phone,
        userStatus: schema.users.status,
        driverStatus: schema.drivers.status,
        vehicleId: schema.vehicles.id,
        vehicleNumber: schema.vehicles.number,
        vehicleModel: schema.vehicles.model,
        trips: sql<number>`(select count(*) from ${schema.trips} t where t.driver_id = ${schema.drivers.userId})`,
      })
      .from(schema.drivers)
      .innerJoin(schema.users, eq(schema.users.id, schema.drivers.userId))
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.drivers.vehicleId))
      .orderBy(asc(schema.users.name)),
    db
      .select({ id: schema.vehicles.id, number: schema.vehicles.number, model: schema.vehicles.model })
      .from(schema.vehicles)
      .orderBy(asc(schema.vehicles.number)),
  ]);

  const vehicleOptions = vehicles.map((v) => ({ value: v.id, label: `${v.number} · ${v.model}` }));

  return (
    <AdminMain>
      <PageHeader
        title="Водители"
        description="Пароль задаёт администратор. Закреплённый транспорт подставляется при генерации рейсов."
      />

      <div className="mb-6">
        <DriversEditor vehicleOptions={vehicleOptions} />
      </div>

      <Table head={["Имя", "Телефон", "Транспорт", "Рейсов", "Статус", ""]}>
        {drivers.map((d) => (
          <Row key={d.id}>
            <Cell className="font-medium">{d.name}</Cell>
            <Cell className="text-muted-foreground tabular-nums">{d.phone}</Cell>
            <Cell className="text-muted-foreground">
              {d.vehicleNumber ? `${d.vehicleNumber} · ${d.vehicleModel}` : "—"}
            </Cell>
            <Cell className="text-muted-foreground tabular-nums">{Number(d.trips)}</Cell>
            <Cell>
              {d.userStatus === "blocked" ? (
                <span className="text-danger">Заблокирован</span>
              ) : d.driverStatus === "active" ? (
                "Активен"
              ) : (
                "Не работает"
              )}
            </Cell>
            <Cell>
              <DriverRowActions
                id={d.id}
                name={d.name}
                phone={d.phone}
                vehicleId={d.vehicleId ?? ""}
                driverStatus={d.driverStatus}
                userStatus={d.userStatus}
                vehicleOptions={vehicleOptions}
              />
            </Cell>
          </Row>
        ))}
      </Table>
    </AdminMain>
  );
}
