import Link from "next/link";
import { eq } from "drizzle-orm";
import { addDays, formatDistance, formatEta, formatLocalTime, localNow, nearestStops } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getUpcomingArrivals, listStops } from "@/lib/queries";
import { AutoRefresh } from "@/components/auto-refresh";
import { LocationSync } from "@/components/location-sync";
import { LogoutButton, MobileHeader } from "@/components/mobile-shell";
import { MapPanel } from "@/components/map";
import { Card, EmptyState, LinkButton, RouteBadge, SectionTitle } from "@/components/ui";
import { IconChevronRight, IconClock, IconPin, IconUsers } from "@/components/icons";
import { BookButton } from "./book-button";

export default async function PassengerHome({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  const user = await requireRole("passenger");
  const { lat, lng } = await searchParams;
  const now = localNow();

  const profile = (
    await db.select().from(schema.passengers).where(eq(schema.passengers.userId, user.id)).limit(1)
  )[0];

  const geoLat = Number(lat);
  const geoLng = Number(lng);
  const hasCoords = Number.isFinite(geoLat) && Number.isFinite(geoLng);
  const origin = hasCoords
    ? { lat: geoLat, lng: geoLng }
    : profile?.lat != null && profile?.lng != null
      ? { lat: profile.lat, lng: profile.lng }
      : null;

  const allStops = (await listStops()).filter((s) => s.status === "active");
  const near = origin ? nearestStops(origin, allStops, { limit: 3 }) : [];
  const dates = [now.date, addDays(now.date, 1), addDays(now.date, 2)];

  const arrivals = near.length
    ? await getUpcomingArrivals({
        stopIds: near.map((n) => n.stop.id),
        dates,
        now: now.instant,
        passengerId: user.id,
        limit: 8,
      })
    : [];

  const first = arrivals[0];
  const firstStop = first ? near.find((n) => n.stop.id === first.stopId) : near[0];
  const rest = arrivals.slice(1, 5);

  const favorites = await db
    .select({
      id: schema.passengerFavorites.id,
      routeId: schema.passengerFavorites.routeId,
      routeName: schema.routes.name,
      routeColor: schema.routes.color,
      routeDescription: schema.routes.description,
    })
    .from(schema.passengerFavorites)
    .leftJoin(schema.routes, eq(schema.routes.id, schema.passengerFavorites.routeId))
    .where(eq(schema.passengerFavorites.passengerId, user.id));
  const favoriteRoutes = favorites.filter((f) => f.routeId && f.routeName);

  return (
    <>
      <AutoRefresh seconds={30} />
      <MobileHeader
        title={`Здравствуйте, ${user.name.split(" ")[0]}`}
        subtitle={now.minutes < 12 * 60 ? "Поездка на работу" : "Поездка домой"}
        action={<LogoutButton compact />}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <LocationSync hasCoords={hasCoords} />

        {!origin ? (
          <EmptyState
            title="Не знаем, где вы находитесь"
            hint="Разрешите доступ к геолокации или укажите домашний адрес в профиле — тогда покажем ближайшую остановку."
            action={<LinkButton href="/app/profile">Указать адрес</LinkButton>}
          />
        ) : !firstStop ? (
          <EmptyState title="Рядом нет остановок" hint="Поблизости не найдено активных остановок корпоративного транспорта." />
        ) : (
          <Card className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <IconPin className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">Ближайшая остановка</p>
                <p className="truncate text-lg font-semibold">{firstStop.stop.name}</p>
                <p className="text-sm text-muted-foreground">{formatDistance(firstStop.distanceM)} от вас</p>
              </div>
            </div>

            {first ? (
              <>
                <div className="border-t border-border pt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Ближайший транспорт</p>
                  <div className="flex items-center gap-3">
                    <RouteBadge name={first.routeName} color={first.routeColor} />
                    <div className="min-w-0 flex-1">
                      <p className="text-2xl font-semibold text-primary">
                        {formatEta(first.eta).replace("через ", "через ")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Прибытие в {formatLocalTime(first.eta.arrivalAt)} · отправление {first.startTime}
                        {first.eta.source === "driver" ? " · по данным водителя" : ""}
                      </p>
                    </div>
                  </div>
                  {first.stopId !== firstStop.stop.id ? (
                    <p className="mt-2 text-xs text-muted-foreground">Остановка: {first.stopName}</p>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <BookButton tripId={first.tripId} stopId={first.stopId} booked={first.bookedByMe} className="flex-1" />
                  <LinkButton href={`/app/trips/${first.tripId}`} className="flex-1">
                    Подробнее
                  </LinkButton>
                </div>
              </>
            ) : (
              <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                На ближайшие дни рейсов через эту остановку нет.
              </p>
            )}
          </Card>
        )}

        {near.length ? (
          <MapPanel
            className="h-56 w-full rounded-[--radius-card] border border-border"
            me={origin}
            stops={near.map((n, i) => ({
              id: n.stop.id,
              name: n.stop.name,
              lat: n.stop.lat,
              lng: n.stop.lng,
              note: formatDistance(n.distanceM),
              highlight: i === 0,
            }))}
          />
        ) : null}

        {rest.length ? (
          <section>
            <SectionTitle>Следующие рейсы</SectionTitle>
            <ul className="flex flex-col gap-2">
              {rest.map((a) => (
                <li key={`${a.tripId}:${a.stopId}`}>
                  <Link
                    href={`/app/trips/${a.tripId}`}
                    className="flex items-center gap-3 rounded-[--radius-card] border border-border bg-card p-3 transition-colors hover:bg-muted"
                  >
                    <RouteBadge name={a.routeName} color={a.routeColor} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.stopName}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <IconClock className="size-3.5" />
                        {formatLocalTime(a.eta.arrivalAt)} · {formatEta(a.eta)}
                        {a.date !== now.date ? " · завтра" : ""}
                      </p>
                    </div>
                    {a.vehicle ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                        <IconUsers className="size-3.5" />
                        {a.booked}/{a.vehicle.capacity}
                      </span>
                    ) : null}
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {favoriteRoutes.length ? (
          <section>
            <SectionTitle action={<Link href="/app/routes" className="text-xs font-medium text-primary">Все маршруты</Link>}>
              Избранные маршруты
            </SectionTitle>
            <ul className="flex flex-col gap-2">
              {favoriteRoutes.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/app/routes/${f.routeId}`}
                    className="flex items-center gap-3 rounded-[--radius-card] border border-border bg-card p-3 transition-colors hover:bg-muted"
                  >
                    <RouteBadge name={f.routeName!} color={f.routeColor} />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.routeDescription}</span>
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
