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
import { listSubscriptions } from "@/lib/subscriptions";
import { MobileHeader } from "@/components/mobile-shell";
import { MapPanel } from "@/components/map";
import { LinkButton, RouteBadge, cx } from "@/components/ui";
import { FavoriteButton } from "@/components/favorite-button";
import { IconCheck } from "@/components/icons";
import { BookButton } from "../../book-button";
import { SubscribeButton, UnsubscribeButton } from "../../subscribe-button";

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
  searchParams: Promise<{ dep?: string; stop?: string }>;
}) {
  const user = await requireRole("passenger");
  const { id } = await params;
  const { dep, stop } = await searchParams;
  const now = localNow();

  const allRoutes = await listRoutes(false);
  const route = allRoutes.find((r) => r.id === id);
  if (!route) notFound();
  // Morning and evening are two routes sharing a name.
  const pair = allRoutes.find((r) => r.name === route.name && r.direction !== route.direction && r.status === "active");

  const [trips, favorites, profileRows, subscriptions] = await Promise.all([
    getRouteTrips(route.id, now.date),
    getFavorites(user.id),
    db.select().from(schema.passengers).where(eq(schema.passengers.userId, user.id)).limit(1),
    listSubscriptions(user.id),
  ]);
  const profile = profileRows[0];
  // One standing booking per direction: this route's, or another route's that a new one would replace.
  const directionSub = subscriptions.find((s) => s.direction === route.direction);
  const mySub = directionSub?.routeId === route.id ? directionSub : undefined;

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
  // A stop tapped in the list wins over the booking and the guess from home.
  const pickedStopId = route.stops.some((s) => s.stopId === stop) ? stop : undefined;
  const boardingStopId = pickedStopId ?? bookedStopId ?? mySub?.stopId ?? nearest?.stop.stopId;
  const boardingStop = route.stops.find((s) => s.stopId === boardingStopId);
  const bookedHere = bookedStopId != null && bookedStopId === boardingStopId;
  const boardingAt = selected && boardingStop ? formatMinutes(selected.minutes + boardingStop.offsetMin) : "";

  const canBook = selected != null && selected.tripId != null && !isGone(selected);
  const href = (to: { dep?: string; stop?: string }) => {
    const query = new URLSearchParams();
    if (to.dep) query.set("dep", to.dep);
    if (to.stop) query.set("stop", to.stop);
    const qs = query.toString();
    return `/app/routes/${route.id}${qs ? `?${qs}` : ""}`;
  };

  const selectedSchedule = selected ? route.schedules.find((s) => s.active && s.departureTime === selected.time) : undefined;
  const canSubscribe = route.status === "active" && selectedSchedule != null;
  const subscribedHere = mySub != null && mySub.scheduleId === selectedSchedule?.id;
  // Stops are tappable whenever there is something to attach to: a trip to book or a departure to subscribe to.
  const canPick = canBook || canSubscribe;

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
                      : d.time === mySub?.departureTime
                        ? "ваш рейс"
                        : gone
                          ? "ушёл"
                          : d.free != null
                            ? seatsLabel(d.free)
                            : "";
                return (
                  <li key={d.time}>
                    <Link
                      href={href({ dep: d.time, stop: pickedStopId })}
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
            {canPick ? <p className="mx-1 text-xs text-muted-foreground">Нажмите на остановку, чтобы выбрать посадку</p> : null}
            <ol className="flex flex-col rounded-2xl bg-card px-3.5 py-1.5">
              {route.stops.map((s, i) => {
                const mine = s.stopId === boardingStopId;
                const last = i === route.stops.length - 1;
                const rowClass = cx(
                  "grid grid-cols-[20px_1fr_auto] items-center gap-x-3",
                  mine ? "-mx-2 min-h-12 rounded-xl bg-highlight-soft px-2" : "min-h-11",
                );
                const body = (
                  <>
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
                          {bookedHere || (subscribedHere && s.stopId === mySub?.stopId)
                            ? "Ваша посадка"
                            : pickedStopId
                              ? "Посадка здесь"
                              : `Ближайшая к дому${nearest ? ` · ${formatDistance(nearest.distanceM)}` : ""}`}
                        </span>
                      ) : s.stopId === bookedStopId ? (
                        <span className="text-xs text-muted-foreground">Сейчас ваша посадка</span>
                      ) : null}
                    </span>
                    <span className={cx("text-sm", mine ? "font-extrabold" : "font-semibold")}>
                      {formatMinutes(selected.minutes + s.offsetMin)}
                    </span>
                  </>
                );
                return (
                  <li key={s.stopId}>
                    {canPick ? (
                      <Link
                        href={href({ dep: selected.time, stop: s.stopId })}
                        replace
                        scroll={false}
                        aria-current={mine ? "true" : undefined}
                        className={cx(rowClass, !mine && "-mx-2 rounded-xl px-2 transition-colors hover:bg-muted")}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={rowClass}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <div className="flex flex-col gap-2">
          {canBook && selected?.tripId && boardingStop ? (
            <BookButton
              key={boardingStop.stopId}
              tripId={selected.tripId}
              stopId={boardingStop.stopId}
              booked={bookedHere}
              bookLabel={
                bookedStopId
                  ? `Садиться на «${boardingStop.name}» в ${boardingAt}`
                  : `Поеду в ${boardingAt} с «${boardingStop.name}»`
              }
              cancelLabel={`Не поеду в ${selected.time}`}
              size="lg"
              className="w-full"
            />
          ) : null}
          {canSubscribe && selected && selectedSchedule ? (
            subscribedHere && mySub ? (
              <section aria-label="Постоянный рейс" className="flex flex-col gap-2 rounded-2xl bg-card p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
                    <IconCheck className="size-4.5" />
                  </span>
                  <p className="min-w-0 flex-1 text-sm leading-snug">
                    <strong>Вы ездите этим рейсом постоянно</strong>
                    <span className="block text-muted-foreground">
                      Посадка: «{mySub.stopName}». Отметка «Поеду» ставится сама.
                    </span>
                  </p>
                  <UnsubscribeButton subscriptionId={mySub.id} />
                </div>
                {boardingStop && boardingStop.stopId !== mySub.stopId ? (
                  <SubscribeButton
                    scheduleId={selectedSchedule.id}
                    stopId={boardingStop.stopId}
                    label={`Сменить посадку на «${boardingStop.name}»`}
                    size="md"
                  />
                ) : null}
              </section>
            ) : boardingStop ? (
              <div className="flex flex-col gap-1.5">
                <SubscribeButton
                  scheduleId={selectedSchedule.id}
                  stopId={boardingStop.stopId}
                  label={
                    directionSub
                      ? `Перейти на рейс ${selected.time} постоянно`
                      : `Ездить рейсом ${selected.time} постоянно`
                  }
                />
                <p className="px-1 text-xs leading-snug text-muted-foreground">
                  {directionSub
                    ? `Заменит привязку к рейсу ${directionSub.departureTime} маршрута ${directionSub.routeName}. Посадка: «${boardingStop.name}».`
                    : `Посадка: «${boardingStop.name}». Отметка «Поеду» будет ставиться сама в каждый день, когда ходит этот рейс.`}
                </p>
              </div>
            ) : (
              <p className="rounded-2xl bg-card px-4 py-3 text-sm text-muted-foreground">
                Выберите остановку посадки в списке выше — и сможете привязаться к рейсу {selected.time}, чтобы не
                нажимать «Поеду» каждый день.
              </p>
            )
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
