import { notFound } from "next/navigation";
import { formatLocalDate, freeSeats } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getTrip } from "@/lib/queries";
import { AutoRefresh } from "@/components/auto-refresh";
import { MobileHeader } from "@/components/mobile-shell";
import { IconBus, IconCheck } from "@/components/icons";
import { BookButton } from "../../book-button";
import { TripLivePanel } from "./live-panel";
import { WalkToStop } from "./walk-to-stop";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("passenger");
  const { id } = await params;

  const trip = await getTrip(id, user.id);
  if (!trip) notFound();

  const open = trip.status === "planned" || trip.status === "in_progress";
  const myStopId = trip.bookedByMe?.stopId;
  const boardingStop = myStopId ? trip.stops.find((s) => s.stopId === myStopId) : undefined;
  const nextStop = trip.stops.find((s) => !s.arrivedAt);
  const defaultStop = boardingStop ?? nextStop ?? trip.stops[0];
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
        <TripLivePanel
          tripId={trip.id}
          status={trip.status}
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
        >
          {open && boardingStop ? (
            <section aria-label="Ваша поездка" className="flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
                <IconCheck className="size-4.5" />
              </span>
              <p className="min-w-0 flex-1 text-sm leading-snug">
                <strong>Вы едете</strong> с «{boardingStop.name}»
                {seatsLine ? <span className="block text-muted-foreground">{seatsLine}</span> : null}
              </p>
              <BookButton
                tripId={trip.id}
                stopId={boardingStop.stopId}
                booked
                cancelLabel="Отменить"
                tone="quiet"
              />
            </section>
          ) : open && defaultStop ? (
            <section aria-label="Бронь" className="flex flex-col gap-2 rounded-2xl bg-card p-3.5">
              {seatsLine ? <p className="text-sm text-muted-foreground">{seatsLine}</p> : null}
              <BookButton
                tripId={trip.id}
                stopId={defaultStop.stopId}
                booked={false}
                bookLabel={`Поеду с «${defaultStop.name}»`}
                size="lg"
                className="w-full"
              />
            </section>
          ) : null}

          {trip.vehicle ? (
            <p className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
              <IconBus className="size-4" />
              {trip.vehicle.model}, {trip.vehicle.number}
            </p>
          ) : null}
        </TripLivePanel>

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
