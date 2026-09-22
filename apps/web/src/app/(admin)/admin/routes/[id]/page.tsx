import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getRoute, getRouteVersions, listStops } from "@/lib/queries";
import { AdminMain, PageHeader } from "@/components/admin-ui";
import { LinkButton } from "@/components/ui";
import { RouteEditor } from "../route-editor";

export default async function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;

  const [route, allStops, versions] = await Promise.all([getRoute(id), listStops(), getRouteVersions(id)]);
  if (!route) notFound();

  // Offer active stops, plus any inactive stop this route still uses.
  const options = allStops
    .filter((s) => s.status === "active" || route.stops.some((rs) => rs.stopId === s.id))
    .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }));

  return (
    <AdminMain>
      <PageHeader
        title={`Маршрут ${route.name}`}
        description={
          route.version
            ? `${route.description ?? ""}${route.description ? " · " : ""}действует версия ${route.version}`
            : (route.description ?? undefined)
        }
        action={<LinkButton href={`/admin/analytics?route=${route.id}`}>Аналитика маршрута</LinkButton>}
      />

      <RouteEditor
        stopOptions={options}
        savedPath={route.path}
        savedDistanceM={route.pathDistanceM}
        versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))}
        initial={{
          id: route.id,
          name: route.name,
          description: route.description ?? "",
          direction: route.direction,
          status: route.status,
          color: route.color,
          plannedCapacity: route.plannedCapacity === null ? "" : String(route.plannedCapacity),
          stops: route.stops.map((s) => ({
            stopId: s.stopId,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            offsetMin: s.offsetMin,
          })),
          departures: route.schedules.map((s) => s.departureTime),
          daysOfWeek: route.schedules[0]?.daysOfWeek ?? [1, 2, 3, 4, 5],
        }}
      />
    </AdminMain>
  );
}
