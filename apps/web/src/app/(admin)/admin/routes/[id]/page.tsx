import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getRoute, listStops } from "@/lib/queries";
import { AdminMain, PageHeader } from "@/components/admin-ui";
import { MapPanel } from "@/components/map";
import { LinkButton } from "@/components/ui";
import { RouteEditor } from "../route-editor";

export default async function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;

  const [route, allStops] = await Promise.all([getRoute(id), listStops()]);
  if (!route) notFound();

  const options = allStops
    .filter((s) => s.status === "active" || route.stops.some((rs) => rs.stopId === s.id))
    .map((s) => ({ id: s.id, name: s.name }));

  return (
    <AdminMain>
      <PageHeader
        title={`Маршрут ${route.name}`}
        description={route.description ?? undefined}
        action={<LinkButton href={`/admin/analytics?route=${route.id}`}>Аналитика маршрута</LinkButton>}
      />

      <div className="mb-6">
        <MapPanel
          className="h-72 w-full rounded-[--radius-card] border border-border"
          lines={[
            {
              id: route.id,
              color: route.color,
              points: route.path ?? route.stops.map((s) => [s.lat, s.lng] as [number, number]),
            },
          ]}
          stops={route.stops.map((s, i) => ({
            id: s.stopId,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            note: `№${i + 1} · +${s.offsetMin} мин`,
            highlight: i === 0,
          }))}
        />
      </div>

      <RouteEditor
        stopOptions={options}
        initial={{
          id: route.id,
          name: route.name,
          description: route.description ?? "",
          direction: route.direction,
          status: route.status,
          color: route.color,
          plannedCapacity: route.plannedCapacity === null ? "" : String(route.plannedCapacity),
          stops: route.stops.map((s) => ({ stopId: s.stopId, offsetMin: s.offsetMin })),
          departures: route.schedules.map((s) => s.departureTime),
          daysOfWeek: route.schedules[0]?.daysOfWeek ?? [1, 2, 3, 4, 5],
        }}
      />
    </AdminMain>
  );
}
