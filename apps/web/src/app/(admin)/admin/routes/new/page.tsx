import { requireRole } from "@/lib/auth";
import { listStops } from "@/lib/queries";
import { AdminMain, PageHeader } from "@/components/admin-ui";
import { RouteEditor } from "../route-editor";

export default async function NewRoutePage() {
  await requireRole("admin");
  const stops = (await listStops()).filter((s) => s.status === "active");

  return (
    <AdminMain>
      <PageHeader
        title="Новый маршрут"
        description="Расставьте точки на карте: нажмите на карту, чтобы создать остановку, или на серую точку, чтобы добавить существующую."
      />
      <RouteEditor
        stopOptions={stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }))}
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
