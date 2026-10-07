import { notFound } from "next/navigation";
import { formatLocalDate, freeSeats } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getTrip } from "@/lib/queries";
import { tripSubscription } from "@/lib/subscriptions";
import { AutoRefresh } from "@/components/auto-refresh";
import { MobileHeader } from "@/components/mobile-shell";
import { TripBoarding } from "./trip-boarding";
import { WalkToStop } from "./walk-to-stop";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("passenger");
  const { id } = await params;

  const trip = await getTrip(id, user.id);
  if (!trip) notFound();
  const standing = await tripSubscription(user.id, trip.id);

  const open = trip.status === "planned" || trip.status === "in_progress";
  const myStopId = trip.bookedByMe?.stopId;
  // Without a booking, boarding defaults to the usual stop of a standing booking,
  // otherwise to the next stop the vehicle hasn't reached.
  const standingStop = standing ? trip.stops.find((s) => s.stopId === standing.stopId && !s.arrivedAt) : undefined;
  const defaultStop = standingStop ?? trip.stops.find((s) => !s.arrivedAt) ?? trip.stops[0];
  const free = freeSeats(trip.vehicle?.capacity, trip.bookedTotal);

  const seatsLine = trip.vehicle
    ? free === 0
      ? `Мест нет · ${trip.vehicle.capacity} из ${trip.vehicle.capacity} занято`
      : `Свободно ${free} из ${trip.vehicle.capacity} мест`
    : null;

  return (
    <>
      {trip.status === "in_progress" ? <AutoRefresh seconds={60} /> : null}
      <MobileHeader
        title={`Маршрут ${trip.route.name} · рейс ${trip.startTime}`}
        subtitle={`${trip.route.description ?? "Маршрут"} · ${formatLocalDate(trip.date)}`}
        back={`/app/routes/${trip.route.id}`}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <TripBoarding
          tripId={trip.id}
          status={trip.status}
          routeName={trip.route.name}
          routeColor={trip.route.color}
          routeLine={trip.route.path}
          bookedStopId={myStopId}
          defaultStopId={defaultStop?.stopId}
          standing={standing != null}
          seatsLine={seatsLine}
          vehicle={trip.vehicle ? { model: trip.vehicle.model, number: trip.vehicle.number } : null}
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

        {open ? (
          <WalkToStop
            tripId={trip.id}
            stops={trip.stops.map((s) => ({ id: s.stopId, name: s.name, lat: s.lat, lng: s.lng }))}
            bookedStopId={myStopId ?? null}
            canBook
          />
        ) : null}
      </main>
    </>
  );
}
