import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { listStops } from "@/lib/queries";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { MapPanel } from "@/components/map";
import { StopRowActions, StopsEditor } from "./stops-editor";

export default async function StopsPage() {
  await requireRole("admin");
  const stops = await listStops();

  const usage = await db
    .select({ stopId: schema.routeStops.stopId, routeName: schema.routes.name })
    .from(schema.routeStops)
    .innerJoin(schema.routes, eq(schema.routes.id, schema.routeStops.routeId));

  const byStop = new Map<string, string[]>();
  for (const u of usage) {
    const list = byStop.get(u.stopId);
    if (list && !list.includes(u.routeName)) list.push(u.routeName);
    else if (!list) byStop.set(u.stopId, [u.routeName]);
  }

  return (
    <AdminMain>
      <PageHeader
        title="Остановки"
        description="Точки посадки и высадки. Координаты используются для поиска ближайшей остановки пассажиром."
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-[2fr_3fr]">
        <StopsEditor />
        <MapPanel
          className="h-96 w-full rounded-[--radius-card] border border-border"
          stops={stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, note: s.address ?? undefined }))}
        />
      </div>

      <Table head={["Название", "Адрес", "Координаты", "Маршруты", "Статус", ""]}>
        {stops.map((s) => (
          <Row key={s.id}>
            <Cell className="font-medium">{s.name}</Cell>
            <Cell className="text-muted-foreground">{s.address ?? "—"}</Cell>
            <Cell className="text-muted-foreground tabular-nums">
              {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
            </Cell>
            <Cell className="text-muted-foreground">{byStop.get(s.id)?.join(", ") ?? "не используется"}</Cell>
            <Cell>{s.status === "active" ? "Активна" : "Отключена"}</Cell>
            <Cell>
              <StopRowActions id={s.id} name={s.name} lat={s.lat} lng={s.lng} address={s.address ?? ""} status={s.status} />
            </Cell>
          </Row>
        ))}
      </Table>
    </AdminMain>
  );
}
