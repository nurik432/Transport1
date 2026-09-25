import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  formatDistance,
  formatMinutes,
  freeSeats,
  localNow,
  nearestStops,
  parseTimeToMinutes,
  seatsLabel,
} from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getFavorites, getRouteTrips, listRoutes } from "@/lib/queries";
import { MobileHeader } from "@/components/mobile-shell";
import { MapPanel } from "@/components/map";
import { LinkButton, RouteBadge, cx } from "@/components/ui";
import { FavoriteButton } from "@/components/favorite-button";
import { BookButton } from "../../book-button";

interface Departure {
  time: string;
  minutes: number;
  tripId: string | null;
  status: "planned" | "in_progress" | "completed" | "cancelled" | null;
  free: number | null;
}

export default async function RoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dep?: string }>;
}) {
  const user = await requireRole("passenger");
  const { id } = await params;
  const { dep } = await searchParams;
  const now = localNow();

  const allRoutes = await listRoutes(false);
  const route = allRoutes.find((r) => r.id === id);
  if (!route) notFound();
  // Morning and evening are two routes sharing a name.
  const pair = allRoutes.find((r) => r.name === route.name && r.direction !== route.direction && r.status === "active");

  const [trips, favorites, profileRows] = await Promise.all([
    getRouteTrips(route.id, now.date),
    getFavorites(user.id),
    db.select().from(schema.passengers).where(eq(schema.passengers.userId, user.id)).limit(1),
  ]);
  const profile = profileRows[0];

  const myBookings = trips.length
    ? await db
        .select({ tripId: schema.passengerTrips.tripId, stopId: schema.passengerTrips.stopId })
        .from(schema.passengerTrips)
        .where(
          and(
            eq(schema.passengerTrips.passengerId, user.id),
            inArray(
              schema.passengerTrips.tripId,
              trips.map((t) => t.id),
            ),
            ne(schema.passengerTrips.status, "cancelled"),
          ),
        )
    : [];
  const bookedStopByTrip = new Map(myBookings.map((b) => [b.tripId, b.stopId]));

  // Today's trips when they exist, otherwise the published schedule for today.
  const departures: Departure[] = trips.length
    ? trips.map((t) => ({
        time: t.startTime,
        minutes: parseTimeToMinutes(t.startTime),
        tripId: t.id,
        status: t.status,
        free: freeSeats(t.vehicleCapacity, t.booked),
      }))
    : route.schedules
        .filter((s) => s.active && s.daysOfWeek.includes(now.weekday))
        .map((s) => ({
          time: s.departureTime,
          minutes: parseTimeToMinutes(s.departureTime),
          tripId: null,
          status: null,
          free: null,
        }));

  const duration = route.stops.at(-1)?.offsetMin ?? 0;
  const isGone = (d: Departure) =>
    d.status === "completed" || d.status === "cancelled" || (d.status !== "in_progress" && d.minutes + duration < now.minutes);
  const upcoming = departures.find((d) => !isGone(d) && d.status !== "in_progress") ?? departures.find((d) => !isGone(d));
  const selected = departures.find((d) => d.time === dep) ?? upcoming ?? departures[0];

  // The stop nearest to home is where the passenger most likely gets on.
  const home = profile?.lat != null && profile?.lng != null ? { lat: profile.lat, lng: profile.lng } : null;
  const nearest = home
    ? nearestStops(
        home,
        route.stops.map((s) => ({ ...s, id: s.stopId })),
        { limit: 1 },
      )[0]
    : undefined;
  const bookedStopId = selected?.tripId ? bookedStopByTrip.get(selected.tripId) : undefined;
  const boardingStopId = bookedStopId ?? nearest?.stop.stopId;
  const boardingStop = route.stops.find((s) => s.stopId === boardingStopId);

  const canBook = selected != null && selected.tripId != null && !isGone(selected);

  return (
    <>
      <MobileHeader
        title={route.description ?? `Маршрут ${route.name}`}
        subtitle={`№${route.name} · ${route.direction === "to_work" ? "утро" : "вечер"} · ${route.stops.length} ост. · ${duration} мин`}
        back="/app/routes"
        action={<FavoriteButton kind="route" id={route.id} active={favorites.routeIds.has(route.id)} />}
      />

      <MapPanel
        className="h-48 w-full"
        lines={[
          {
            id: route.id,
            color: route.color,
            // The stored road geometry, or straight lines until it is built.
            points: route.path ?? route.stops.map((s) => [s.lat, s.lng] as [number, number]),
          },
        ]}
        me={home}
        stops={route.stops.map((s) => ({
          id: s.stopId,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          note: selected ? formatMinutes(selected.minutes + s.offsetMin) : undefined,
          highlight: s.stopId === boardingStopId,
        }))}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <section className="flex flex-col gap-2">
          <h2 className="mx-1 text-[15px] font-bold">Отправления сегодня</h2>
          {departures.length === 0 ? (
            <p className="rounded-2xl bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              Сегодня по этому маршруту рейсов нет.
            </p>
          ) : (
            <ul className="grid grid-cols-4 gap-2">
              {departures.map((d) => {
                const active = d === selected;
                const gone = isGone(d);
                const note =
                  d.status === "cancelled"
                    ? "отменён"
                    : d.status === "in_progress"
                      ? "в пути"
                      : gone
                        ? "ушёл"
                        : d.free != null
                          ? seatsLabel(d.free)
                          : "";
                return (
                  <li key={d.time}>
                    <Link
                      href={`/app/routes/${route.id}?dep=${d.time}`}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={cx(
                        "flex min-h-14 flex-col items-center justify-center rounded-xl transition-colors",
                        active
                          ? "border-2 border-primary bg-primary-soft"
                          : "border border-border bg-card hover:border-primary",
                        gone && !active && "text-muted-foreground",
                      )}
                    >
                      <span className={cx("text-base", active ? "font-extrabold" : "font-bold", d.status === "cancelled" && "line-through")}>
                        {d.time}
                      </span>
                      {note ? (
                        <span
                          className={cx(
                            "text-[11px]",
                            active ? "font-semibold text-primary" : "text-muted-foreground",
                            d.status === "cancelled" && "text-danger",
                          )}
                        >
                          {note}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {selected ? (
          <section className="flex flex-col gap-2">
            <h2 className="mx-1 text-[15px] font-bold">Остановки рейса {selected.time}</h2>
            <ol className="flex flex-col rounded-2xl bg-card px-3.5 py-1.5">
              {route.stops.map((s, i) => {
                const mine = s.stopId === boardingStopId;
                const last = i === route.stops.length - 1;
                return (
                  <li
                    key={s.stopId}
                    className={cx(
                      "grid grid-cols-[20px_1fr_auto] items-center gap-x-3",
                      mine ? "-mx-2 min-h-12 rounded-xl bg-highlight-soft px-2" : "min-h-11",
                    )}
                  >
                    {mine ? (
                      <span className="size-4 justify-self-center rounded-full bg-highlight" />
                    ) : last ? (
                      <span className="size-3.5 justify-self-center rounded" style={{ backgroundColor: route.color }} />
                    ) : (
                      <span className="size-3 justify-self-center rounded-full border-3" style={{ borderColor: route.color }} />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className={cx("truncate text-sm", (mine || last) && "font-semibold", mine && "font-bold")}>
                        {s.name}
                      </span>
                      {mine ? (
                        <span className="text-xs font-semibold text-late">
                          {bookedStopId
                            ? "Ваша посадка"
                            : `Ближайшая к дому${nearest ? ` · ${formatDistance(nearest.distanceM)}` : ""}`}
                        </span>
                      ) : null}
                    </span>
                    <span className={cx("text-sm", mine ? "font-extrabold" : "font-semibold")}>
                      {formatMinutes(selected.minutes + s.offsetMin)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <div className="flex flex-col gap-2">
          {canBook && selected?.tripId && boardingStop ? (
            <BookButton
              tripId={selected.tripId}
              stopId={boardingStop.stopId}
              booked={Boolean(bookedStopId)}
              bookLabel={`Поеду в ${formatMinutes(selected.minutes + boardingStop.offsetMin)} с «${boardingStop.name}»`}
              cancelLabel={`Не поеду в ${selected.time}`}
              size="lg"
              className="w-full"
            />
          ) : null}
          {selected?.tripId ? (
            <LinkButton href={`/app/trips/${selected.tripId}`} variant={canBook && boardingStop ? "ghost" : "secondary"} className="w-full">
              {canBook && !boardingStop ? "Выбрать остановку в рейсе" : "Подробнее о рейсе"}
            </LinkButton>
          ) : null}
          {pair ? (
            <Link
              href={`/app/routes/${pair.id}`}
              className="flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-primary"
            >
              <RouteBadge name={pair.name} color={pair.color} />
              {pair.direction === "from_work" ? "Вечерний рейс домой" : "Утренний рейс на работу"}
            </Link>
          ) : null}
        </div>
      </main>
    </>
  );
}
