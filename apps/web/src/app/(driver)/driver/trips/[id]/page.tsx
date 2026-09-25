import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { durationLabel, formatLocalDate, formatLocalTime, localNow, parseTimeToMinutes, plural } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getTrip } from "@/lib/queries";
import { getDeviationSettings } from "@/lib/live";
import { AutoRefresh } from "@/components/auto-refresh";
import { RouteBadge } from "@/components/ui";
import { IconArrowLeft, IconCheck } from "@/components/icons";
import { BeforeStart, type StartStop } from "./before-start";
import { DrivingScreen, type DriveStop } from "./driving-screen";

export default async function DriverTripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("driver");
  const { id } = await params;
  const now = localNow();

  const [trip, deviation] = await Promise.all([getTrip(id), getDeviationSettings()]);
  if (!trip) notFound();
  if (trip.driver?.id !== user.id) redirect("/driver");

  const vehicleLabel = trip.vehicle ? `${trip.vehicle.model}, ${trip.vehicle.number}` : null;

  // ------------------------------------------------------------ in progress
  if (trip.status === "in_progress") {
    const stops: DriveStop[] = trip.stops.map((s) => ({
      stopId: s.stopId,
      name: s.name,
      seq: s.seq,
      offsetMin: s.offsetMin,
      lat: s.lat,
      lng: s.lng,
      roadDistanceM: s.roadDistanceM,
      plannedAt: s.plannedAt.toISOString(),
      plannedLabel: formatLocalTime(s.plannedAt),
      arrivedLabel: s.arrivedAt ? formatLocalTime(s.arrivedAt) : null,
      arrived: Boolean(s.arrivedAt),
      departed: Boolean(s.departedAt),
      boarded: s.boarded,
      alighted: s.alighted,
      waiting: s.waiting,
      waitingNames: s.waitingNames,
    }));

    return (
      <>
        <AutoRefresh seconds={45} />
        <DrivingScreen
          tripId={trip.id}
          routeName={trip.route.name}
          routeColor={trip.route.color}
          startTime={trip.startTime}
          capacity={trip.vehicle?.capacity ?? null}
          path={trip.route.path}
          stops={stops}
          offRouteThresholdM={deviation.offRouteM}
          serverNow={now.instant.toISOString()}
        />
      </>
    );
  }

  const header = (
    <header className="flex items-center gap-2 bg-card px-3 pt-3 pb-2.5">
      <Link
        href="/driver"
        aria-label="Назад к рейсам"
        className="flex size-11 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted"
      >
        <IconArrowLeft />
      </Link>
      <RouteBadge
        name={trip.route.name}
        color={trip.route.color}
        className="h-8 min-w-9 justify-center rounded-lg px-2 text-base font-extrabold"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate text-[17px] font-bold">Рейс {trip.startTime}</h1>
        {/* Time first: on a long route name truncation must not eat it. */}
        <p className="truncate text-[13px] text-muted-foreground">
          {trip.status === "planned" ? `${untilLabel(trip.startTime, now.minutes, trip.date, now.date)} · ` : ""}
          {trip.route.description}
        </p>
      </div>
    </header>
  );

  // ----------------------------------------------------------------- planned
  if (trip.status === "planned") {
    const stops: StartStop[] = trip.stops.map((s) => ({
      stopId: s.stopId,
      name: s.name,
      plannedLabel: formatLocalTime(s.plannedAt),
      waiting: s.waiting,
    }));

    return (
      <div className="flex min-h-dvh flex-col">
        {header}
        <BeforeStart
          tripId={trip.id}
          vehicleLabel={vehicleLabel}
          capacity={trip.vehicle?.capacity ?? null}
          booked={trip.bookedTotal}
          stops={stops}
        />
      </div>
    );
  }

  // --------------------------------------------------------------- finished
  const carried = trip.stops.reduce((sum, s) => sum + s.boarded, 0);
  const marked = trip.stops.filter((s) => s.arrivedAt).length;

  return (
    <>
      {header}
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <section className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-4 py-7 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-ok-soft text-ok">
            <IconCheck className="size-6" />
          </span>
          <p className="text-lg font-bold">{trip.status === "completed" ? "Рейс завершён" : "Рейс отменён"}</p>
          <p className="text-sm text-muted-foreground">{formatLocalDate(trip.date)}</p>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5 rounded-2xl bg-card p-3.5">
            <span className="text-[26px] font-extrabold tabular-nums">{carried}</span>
            <span className="text-[13px] text-muted-foreground">перевезено</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-2xl bg-card p-3.5">
            <span className="text-[26px] font-extrabold tabular-nums">
              {marked}/{trip.stops.length}
            </span>
            <span className="text-[13px] text-muted-foreground">
              {plural(trip.stops.length, ["остановка", "остановки", "остановок"])}
            </span>
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="mx-1 text-[15px] font-bold">Остановки</h2>
          <ol className="flex flex-col rounded-2xl bg-card px-3.5 py-1.5">
            {trip.stops.map((s, i) => (
              <li
                key={s.stopId}
                className="grid min-h-13 grid-cols-[24px_1fr_auto] items-center gap-x-3 border-b border-divider last:border-b-0"
              >
                <span className="text-center text-[13px] font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="truncate text-[15px] font-semibold">{s.name}</span>
                <span className="text-right text-[13px] text-muted-foreground tabular-nums">
                  {s.arrivedAt ? `факт ${formatLocalTime(s.arrivedAt)}` : `план ${formatLocalTime(s.plannedAt)}`}
                  {s.arrivedAt ? ` · +${s.boarded}/−${s.alighted}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}

/** "через 25 мин" while the departure is ahead, otherwise how late it already is. */
function untilLabel(startTime: string, nowMinutes: number, tripDate: string, today: string): string {
  if (tripDate !== today) return formatLocalDate(tripDate);
  const left = parseTimeToMinutes(startTime) - nowMinutes;
  if (left > 0) return `через ${durationLabel(left)}`;
  return `отправление было ${durationLabel(-left)} назад`;
}
