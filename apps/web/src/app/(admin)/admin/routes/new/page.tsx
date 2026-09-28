import { localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { hasActiveVehicles, listStops } from "@/lib/queries";
import { AdminMain, PageHeader } from "@/components/admin-ui";
import { RouteEditor } from "../editor/route-editor";

export default async function NewRoutePage() {
  await requireRole("admin");
  const [allStops, hasVehicles] = await Promise.all([listStops(), hasActiveVehicles()]);
  const stops = allStops.filter((s) => s.status === "active");

  return (
    <AdminMain>
      <PageHeader
        title="Новый маршрут"
        description="Четыре шага: основное, точки на карте, расписание, проверка. Под кнопкой «Далее» написано, чего не хватает."
      />
      <RouteEditor
        mode="create"
        facts={{ plannedTripCount: 0, unassignedTripCount: 0, hasVehicles, today: localNow().date }}
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
