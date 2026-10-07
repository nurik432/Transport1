"use client";

import { MapPanel } from "@/components/map";
import { useTripLive } from "@/components/live-trip";

/** Where the booked vehicle is right now, next to the passenger's boarding stop. */
export function LiveBusMap({
  tripId,
  routeName,
  routeColor,
  stop,
}: {
  tripId: string;
  routeName: string;
  routeColor: string;
  stop: { id: string; name: string; lat: number; lng: number };
}) {
  const live = useTripLive(tripId, true);
  if (!live.position) {
    return <p className="text-sm text-ink-muted">Транспорт ещё не передал местоположение.</p>;
  }
  return (
    <MapPanel
      className="h-44 w-full overflow-hidden rounded-2xl"
      expandable={false}
      stops={[{ ...stop, highlight: true }]}
      vehicles={[
        {
          id: tripId,
          lat: live.position.lat,
          lng: live.position.lng,
          label: `Маршрут ${routeName}`,
          color: routeColor,
          stale: live.tracking !== "live",
        },
      ]}
      fitPoints={[
        [live.position.lat, live.position.lng],
        [stop.lat, stop.lng],
      ]}
      fitKey={tripId}
    />
  );
}
