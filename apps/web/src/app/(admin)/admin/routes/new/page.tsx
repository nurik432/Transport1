import { requireRole } from "@/lib/auth";
import { listStops } from "@/lib/queries";
import { AdminMain, PageHeader } from "@/components/admin-ui";
import { EmptyState, LinkButton } from "@/components/ui";
import { RouteEditor } from "../route-editor";

export default async function NewRoutePage() {
  await requireRole("admin");
  const stops = (await listStops()).filter((s) => s.status === "active");

  if (stops.length < 2) {
    return (
      <AdminMain>
        <PageHeader title="Новый маршрут" />
        <EmptyState
          title="Сначала создайте остановки"
          hint="Для маршрута нужно минимум две активные остановки."
          action={<LinkButton href="/admin/stops">Перейти к остановкам</LinkButton>}
        />
      </AdminMain>
    );
  }

  return (
    <AdminMain>
      <PageHeader title="Новый маршрут" description="Задайте остановки, время в пути и отправления." />
      <RouteEditor
        stopOptions={stops.map((s) => ({ id: s.id, name: s.name }))}
        initial={{
          name: "",
          description: "",
          direction: "to_work",
          status: "active",
          color: "#2563eb",
          plannedCapacity: "",
          stops: [],
          departures: [],
          daysOfWeek: [1, 2, 3, 4, 5],
        }}
      />
    </AdminMain>
  );
}
