import { notFound, redirect } from "next/navigation";
import { formatLocalDate, formatLocalTime, localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getTrip } from "@/lib/queries";
import { AutoRefresh } from "@/components/auto-refresh";
import { MobileHeader } from "@/components/mobile-shell";
import { Card, RouteBadge, SectionTitle, cx } from "@/components/ui";
import { IconBus, IconUsers } from "@/components/icons";
import { DrivingPanel, type PanelStop } from "./driving-panel";
import { PositionTracker } from "./position-tracker";

export default async function DriverTripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("driver");
  const { id } = await params;
  const now = localNow();

  const trip = await getTrip(id);
  if (!trip) notFound();
  if (trip.driver?.id !== user.id) redirect("/driver");

  const stops: PanelStop[] = trip.stops.map((s) => ({
    stopId: s.stopId,
    name: s.name,
    seq: s.seq,
    plannedLabel: formatLocalTime(s.plannedAt),
    arrivedLabel: s.arrivedAt ? formatLocalTime(s.arrivedAt) : null,
    arrived: Boolean(s.arrivedAt),
    departed: Boolean(s.departedAt),
    boarded: s.boarded,
    alighted: s.alighted,
    waiting: s.waiting,
    waitingNames: s.waitingNames,
  }));

  const minutesTo: Record<string, number> = {};
  for (const s of trip.stops) {
    minutesTo[s.stopId] = Math.round((s.plannedAt.getTime() - now.instant.getTime()) / 60_000);
  }

  return (
    <>
      {trip.status === "in_progress" ? <AutoRefresh seconds={45} /> : null}
      <MobileHeader
        title={`Рейс ${trip.startTime}`}
        subtitle={`${trip.route.name} · ${formatLocalDate(trip.date)}`}
        back="/driver"
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <Card className="flex items-center gap-3">
          <RouteBadge name={trip.route.name} color={trip.route.color} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{trip.route.description}</p>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <IconBus className="size-3.5" />
                {trip.vehicle ? `${trip.vehicle.model}, ${trip.vehicle.number}` : "транспорт не назначен"}
              </span>
              <span className="flex items-center gap-1 tabular-nums">
                <IconUsers className="size-3.5" />
                {trip.bookedTotal}
                {trip.vehicle ? `/${trip.vehicle.capacity}` : ""}
              </span>
            </p>
          </div>
        </Card>

        <PositionTracker tripId={trip.id} active={trip.status === "in_progress"} />

        <DrivingPanel tripId={trip.id} status={trip.status} stops={stops} minutesTo={minutesTo} />

        <section>
          <SectionTitle>Все остановки</SectionTitle>
          <Card className="p-0">
            <ol className="flex flex-col">
              {trip.stops.map((s, i) => (
                <li
                  key={s.stopId}
                  className={cx(
                    "flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0",
                    s.arrivedAt && !s.departedAt && "bg-primary-soft/40",
                  )}
                >
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      план {formatLocalTime(s.plannedAt)}
                      {s.arrivedAt ? ` · факт ${formatLocalTime(s.arrivedAt)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums">
                    {s.arrivedAt ? (
                      <span className="text-muted-foreground">
                        +{s.boarded} / −{s.alighted}
                      </span>
                    ) : s.waiting > 0 ? (
                      <span className="text-primary">ждут {s.waiting}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      </main>
    </>
  );
}
