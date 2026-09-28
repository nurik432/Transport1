import { requireRole } from "@/lib/auth";
import { listStopUsage, listStops } from "@/lib/queries";
import { AdminMain, Cell, PageHeader, Row, Table } from "@/components/admin-ui";
import { StopRowActions } from "./stops-editor";
import { StopsWorkspace } from "./stops-workspace";

export default async function StopsPage({ searchParams }: { searchParams: Promise<{ stop?: string }> }) {
  await requireRole("admin");
  // The table rows link here with ?stop=<id>, the same way the trips and live
  // screens carry their selection, so a stop can be shared by link.
  const [{ stop }, stops, usage] = await Promise.all([searchParams, listStops(), listStopUsage()]);
  const selectedId = stops.some((s) => s.id === stop) ? (stop as string) : null;

  return (
    <AdminMain>
      <PageHeader
        title="Остановки"
        description="Остановку ставят на карте: найдите место по названию или нажмите на карту. Координаты подставятся сами."
      />

      <div id="stop-workspace" className="mb-6 scroll-mt-4">
        <StopsWorkspace
          key={selectedId ?? "new"}
          stops={stops.map((s) => ({
            id: s.id,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            address: s.address,
            status: s.status,
          }))}
          usage={Object.fromEntries(usage)}
          selectedId={selectedId}
        />
      </div>

      <Table head={["Название", "Адрес", "Координаты", "Маршруты", "Статус", ""]}>
        {stops.map((s) => (
          <Row key={s.id} tone={s.id === selectedId ? "attention" : "plain"}>
            <Cell className="font-medium">{s.name}</Cell>
            <Cell className="text-muted-foreground">{s.address ?? "—"}</Cell>
            <Cell className="text-muted-foreground tabular-nums">
              {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
            </Cell>
            <Cell className="text-muted-foreground">{usage.get(s.id)?.join(", ") ?? "не используется"}</Cell>
            <Cell>{s.status === "active" ? "Активна" : "Отключена"}</Cell>
            <Cell>
              <StopRowActions id={s.id} name={s.name} />
            </Cell>
          </Row>
        ))}
      </Table>
    </AdminMain>
  );
}
