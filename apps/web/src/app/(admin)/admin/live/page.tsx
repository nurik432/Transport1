import { Suspense } from "react";
import { localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getLiveSignals, getLiveVehicles } from "@/lib/live";
import { listRoutes } from "@/lib/queries";

import { LiveBoard } from "./live-board";

export default async function LivePage() {
  await requireRole("admin");

  const now = localNow();
  const [routes, vehicles, signals] = await Promise.all([
    listRoutes(true),
    getLiveVehicles(now.instant),
    getLiveSignals(now.instant, now.date),
  ]);

  // One marker per stop, one line per route.
  const stopById = new Map<string, { id: string; name: string; lat: number; lng: number }>();
  for (const route of routes) {
    for (const s of route.stops) {
      if (!stopById.has(s.stopId)) stopById.set(s.stopId, { id: s.stopId, name: s.name, lat: s.lat, lng: s.lng });
    }
  }

  return (
    <Suspense>
      <LiveBoard
        stops={[...stopById.values()]}
        lines={routes
          .filter((r) => r.direction === "to_work")
          .map((r) => ({
            id: r.id,
            color: r.color,
            points: r.path ?? r.stops.map((s) => [s.lat, s.lng] as [number, number]),
            dashed: true,
          }))}
        initialVehicles={vehicles.map((v) => ({ ...v, recordedAt: v.recordedAt.toISOString() }))}
        initialSignals={signals}
      />
    </Suspense>
  );
}
