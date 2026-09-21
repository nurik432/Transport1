import { notFound } from "next/navigation";
import { formatEta, formatLocalDate, formatLocalTime, localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getTrip } from "@/lib/queries";
import { AutoRefresh } from "@/components/auto-refresh";
import { MobileHeader } from "@/components/mobile-shell";
import { MapPanel } from "@/components/map";
import { Card, RouteBadge, SectionTitle, cx } from "@/components/ui";
import { IconBus, IconCheck, IconUsers } from "@/components/icons";
import { BookButton } from "../../book-button";

const TRIP_STATUS_LABEL: Record<string, string> = {
  planned: "По расписанию",
  in_progress: "В пути",
  completed: "Завершён",
  cancelled: "Отменён",
};

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("passenger");
  const { id } = await params;
  const now = localNow();

  const trip = await getTrip(id, user.id);
  if (!trip) notFound();

  const myStopId = trip.bookedByMe?.stopId;
  const boardingStop = myStopId ? trip.stops.find((s) => s.stopId === myStopId) : undefined;
  const nextStop = trip.stops.find((s) => !s.arrivedAt);
  const defaultStopId = boardingStop?.stopId ?? nextStop?.stopId ?? trip.stops[0]?.stopId;

  return (
    <>
      {trip.status === "in_progress" ? <AutoRefresh seconds={20} /> : null}
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

        <MapPanel
          className="h-56 w-full rounded-[--radius-card] border border-border"
          lines={[{ id: trip.route.id, color: trip.route.color, points: trip.stops.map((s) => [s.lat, s.lng]) }]}
          stops={trip.stops.map((s) => ({
            id: s.stopId,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            note: formatLocalTime(s.arrivedAt ?? s.plannedAt),
            highlight: s.stopId === myStopId,
          }))}
        />

        <section>
          <SectionTitle>Остановки и время</SectionTitle>
          <Card className="p-0">
            <ol className="flex flex-col">
              {trip.stops.map((s, i) => {
                const passed = Boolean(s.arrivedAt);
                const isMine = s.stopId === myStopId;
                const delayMin = s.arrivedAt
                  ? Math.round((s.arrivedAt.getTime() - s.plannedAt.getTime()) / 60_000)
                  : null;
                return (
                  <li
                    key={s.stopId}
                    className={cx(
                      "flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0",
                      isMine && "bg-primary-soft/40",
                    )}
                  >
                    <div className="flex flex-col items-center self-stretch pt-1">
                      <span
                        className={cx("flex size-3 items-center justify-center rounded-full border-2")}
                        style={{
                          borderColor: trip.route.color,
                          backgroundColor: passed ? trip.route.color : "#fff",
                        }}
                      />
                      {i < trip.stops.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cx("text-sm", isMine ? "font-semibold" : "font-medium")}>
                        {i + 1}. {s.name}
                        {isMine ? " · ваша остановка" : ""}
                      </p>
                      {s.waiting > 0 ? (
                        <p className="text-xs text-muted-foreground">Ожидают: {s.waiting}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium tabular-nums">
                        {formatLocalTime(s.arrivedAt ?? s.plannedAt)}
                      </p>
                      {passed ? (
                        <p className="flex items-center justify-end gap-0.5 text-xs text-muted-foreground">
                          <IconCheck className="size-3" />
                          {delayMin && delayMin > 0 ? `+${delayMin} мин` : "по плану"}
                        </p>
                      ) : trip.status === "in_progress" ? (
                        <p className="text-xs text-primary">
                          {formatEta({
                            minutesFromNow: Math.round((s.plannedAt.getTime() - now.instant.getTime()) / 60_000),
                            passed: false,
                          })}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </section>
      </main>
    </>
  );
}
