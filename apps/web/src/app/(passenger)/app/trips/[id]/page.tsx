import { notFound } from "next/navigation";
import { formatLocalDate } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getTrip } from "@/lib/queries";
import { AutoRefresh } from "@/components/auto-refresh";
import { MobileHeader } from "@/components/mobile-shell";
import { Card, RouteBadge } from "@/components/ui";
import { IconBus, IconUsers } from "@/components/icons";
import { BookButton } from "../../book-button";
import { TripLivePanel } from "./live-panel";
import { WalkToStop } from "./walk-to-stop";

const TRIP_STATUS_LABEL: Record<string, string> = {
  planned: "По расписанию",
  in_progress: "В пути",
  completed: "Завершён",
  cancelled: "Отменён",
};

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("passenger");
  const { id } = await params;

  const trip = await getTrip(id, user.id);
  if (!trip) notFound();

  const myStopId = trip.bookedByMe?.stopId;
  const boardingStop = myStopId ? trip.stops.find((s) => s.stopId === myStopId) : undefined;
  const nextStop = trip.stops.find((s) => !s.arrivedAt);
  const defaultStopId = boardingStop?.stopId ?? nextStop?.stopId ?? trip.stops[0]?.stopId;

  return (
    <>
      {trip.status === "in_progress" ? <AutoRefresh seconds={60} /> : null}
      <MobileHeader
        title={`Рейс ${trip.startTime}`}
        subtitle={`Маршрут ${trip.route.name} · ${formatLocalDate(trip.date)}`}
        back={`/app/routes/${trip.route.id}`}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <RouteBadge name={trip.route.name} color={trip.route.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{trip.route.description}</p>
              <p className="text-xs text-muted-foreground">
                {TRIP_STATUS_LABEL[trip.status]} · отправление {trip.startTime}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-sm">
            {trip.vehicle ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <IconBus className="size-4" />
                {trip.vehicle.model}, {trip.vehicle.number}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
              <IconUsers className="size-4" />
              Поедут: {trip.bookedTotal}
              {trip.vehicle ? ` из ${trip.vehicle.capacity}` : ""}
            </span>
          </div>

          {trip.status === "planned" || trip.status === "in_progress" ? (
            <BookButton
              tripId={trip.id}
              stopId={defaultStopId ?? ""}
              booked={Boolean(trip.bookedByMe)}
              className="w-full"
            />
          ) : null}
          {boardingStop ? (
            <p className="text-center text-xs text-muted-foreground">Посадка на остановке «{boardingStop.name}»</p>
          ) : null}
        </Card>

        {trip.status === "planned" || trip.status === "in_progress" ? (
          <WalkToStop
            tripId={trip.id}
            stops={trip.stops.map((s) => ({ id: s.stopId, name: s.name, lat: s.lat, lng: s.lng }))}
            bookedStopId={myStopId ?? null}
            canBook
          />
        ) : null}

        <TripLivePanel
          tripId={trip.id}
          active={trip.status === "in_progress"}
          routeName={trip.route.name}
          routeColor={trip.route.color}
          routeLine={trip.route.path}
          myStopId={myStopId}
          stops={trip.stops.map((s) => ({
            stopId: s.stopId,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            plannedAt: s.plannedAt.toISOString(),
            arrivedAt: s.arrivedAt ? s.arrivedAt.toISOString() : null,
            waiting: s.waiting,
          }))}
        />
      </main>
    </>
  );
}
