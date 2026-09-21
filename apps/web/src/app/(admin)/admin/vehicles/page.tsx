import { asc, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { VehicleRowActions, VehiclesEditor } from "./vehicles-editor";

const STATUS_LABEL: Record<string, string> = { active: "В работе", repair: "На ремонте", inactive: "Отключён" };

export default async function VehiclesPage() {
  await requireRole("admin");

  const vehicles = await db
    .select({
      id: schema.vehicles.id,
      number: schema.vehicles.number,
      model: schema.vehicles.model,
      capacity: schema.vehicles.capacity,
      status: schema.vehicles.status,
      driverName: schema.users.name,
      trips: sql<number>`(select count(*) from ${schema.trips} t where t.vehicle_id = ${schema.vehicles.id})`,
    })
    .from(schema.vehicles)
    .leftJoin(schema.drivers, eq(schema.drivers.vehicleId, schema.vehicles.id))
    .leftJoin(schema.users, eq(schema.users.id, schema.drivers.userId))
    .orderBy(asc(schema.vehicles.number));

  return (
    <AdminMain>
      <PageHeader
        title="Транспорт"
        description="Вместимость транспорта — знаменатель при расчёте загрузки рейса."
      />

      <div className="mb-6">
        <VehiclesEditor />
      </div>

      <Table head={["Гос. номер", "Модель", "Мест", "Закреплён за", "Рейсов", "Статус", ""]}>
        {vehicles.map((v) => (
          <Row key={v.id}>
            <Cell className="font-medium tabular-nums">{v.number}</Cell>
            <Cell>{v.model}</Cell>
            <Cell className="tabular-nums">{v.capacity}</Cell>
            <Cell className="text-muted-foreground">{v.driverName ?? "—"}</Cell>
            <Cell className="text-muted-foreground tabular-nums">{Number(v.trips)}</Cell>
            <Cell>{STATUS_LABEL[v.status]}</Cell>
            <Cell>
              <VehicleRowActions
                id={v.id}
                number={v.number}
                model={v.model}
                capacity={v.capacity}
                status={v.status}
              />
            </Cell>
          </Row>
        ))}
      </Table>
    </AdminMain>
  );
}
