import Link from "next/link";
import { eq } from "drizzle-orm";
import { addDays, formatDistance, formatLocalDate, localNow, nearestStops } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getUpcomingArrivals, listStops } from "@/lib/queries";
import { AutoRefresh } from "@/components/auto-refresh";
import { LocationSync } from "@/components/location-sync";
import { LogoutButton } from "@/components/mobile-shell";
import { MapPanel } from "@/components/map";
import { LinkButton, RouteBadge, cx } from "@/components/ui";
import { IconPin } from "@/components/icons";
import { ArrivalList, ArrivalRow, BoardSection, EtaHero, TripCard } from "./home-board";

type Direction = "to_work" | "from_work";

function greeting(minutes: number): string {
  if (minutes < 12 * 60) return "Доброе утро";
  if (minutes < 18 * 60) return "Добрый день";
  return "Добрый вечер";
}

export default async function PassengerHome({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string; dir?: string }>;
}) {
  const user = await requireRole("passenger");
  const { lat, lng, dir } = await searchParams;
  const now = localNow();
  const direction: Direction =
    dir === "to_work" || dir === "from_work" ? dir : now.minutes < 12 * 60 ? "to_work" : "from_work";

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
        direction,
        limit: 12,
      })
    : [];

  const distanceTo = (stopId: string) => near.find((n) => n.stop.id === stopId)?.distanceM ?? null;

  // A booked trip takes over the main card; otherwise the next vehicle does.
  const mine = arrivals.find((a) => a.bookedByMe && !a.eta.passed);
  const first = mine ?? arrivals[0];
  const heroStopId = first?.stopId ?? near[0]?.stop.id;
  const heroStop = near.find((n) => n.stop.id === heroStopId);
  const others = first
    ? arrivals
        .filter((a) => a !== first && a.stopId === heroStopId && a.eta.arrivalAt > first.eta.arrivalAt)
        .slice(0, 3)
    : [];

  const favorites = await db
    .select({
      id: schema.passengerFavorites.id,
      routeId: schema.passengerFavorites.routeId,
      routeName: schema.routes.name,
      routeColor: schema.routes.color,
      routeDescription: schema.routes.description,
      routeDirection: schema.routes.direction,
    })
    .from(schema.passengerFavorites)
    .leftJoin(schema.routes, eq(schema.routes.id, schema.passengerFavorites.routeId))
    .where(eq(schema.passengerFavorites.passengerId, user.id));
  const favoriteRoutes = favorites.filter((f) => f.routeId && f.routeName && f.routeDirection === direction);

  const dateLabel = formatLocalDate(now.date, { weekday: "long", day: "numeric", month: "long" });
  const dirHref = (d: Direction) => {
    const q = new URLSearchParams({ dir: d });
    if (hasCoords) {
      q.set("lat", String(geoLat));
      q.set("lng", String(geoLng));
    }
    return `/app?${q.toString()}`;
  };

  return (
    <>
      <AutoRefresh seconds={30} />

      <header className="mx-auto flex w-full max-w-md items-end justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground first-letter:uppercase">{dateLabel}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {mine
              ? direction === "to_work"
                ? "Вы едете на работу"
                : "Вы едете домой"
              : `${greeting(now.minutes)}, ${user.name.split(" ")[0]}`}
          </h1>
        </div>
        <LogoutButton compact />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-4">
        <nav aria-label="Направление" className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          {(
            [
              { key: "to_work", label: "На работу" },
              { key: "from_work", label: "Домой" },
            ] as const
          ).map((tab) => (
            <Link
              key={tab.key}
              href={dirHref(tab.key)}
              aria-current={direction === tab.key ? "page" : undefined}
              className={cx(
                "flex min-h-10 items-center justify-center rounded-full text-sm transition-colors",
                direction === tab.key
                  ? "bg-card font-semibold text-foreground shadow-xs"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <LocationSync hasCoords={hasCoords} />

        {!origin ? (
          <section className="flex flex-col gap-4 rounded-3xl bg-card px-5 pt-6 pb-5">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <IconPin className="size-7" />
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-xl font-bold">Покажем ближайшую остановку</h2>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                Разрешите доступ к геолокации в браузере или укажите домашний адрес — по нему найдём остановку, когда
                геолокация недоступна.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <LinkButton href="/app/profile" variant="primary" size="lg">
                Указать домашний адрес
              </LinkButton>
              <LinkButton href="/app/routes" variant="ghost">
                Выбрать маршрут из списка
              </LinkButton>
            </div>
          </section>
        ) : !heroStop ? (
          <section className="rounded-3xl bg-card px-5 py-8 text-center">
            <p className="font-semibold">Рядом нет остановок</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Поблизости не найдено активных остановок корпоративного транспорта.
            </p>
          </section>
        ) : !first ? (
          <section className="flex flex-col gap-3 rounded-3xl bg-card p-5">
            <div className="flex items-center gap-2.5">
              <IconPin className="size-5 text-primary" />
              <div>
                <p className="font-semibold">{heroStop.stop.name}</p>
                <p className="text-sm text-muted-foreground">Ближайшая остановка · {formatDistance(heroStop.distanceM)}</p>
              </div>
            </div>
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
              {direction === "to_work" ? "На работу" : "Домой"} через эту остановку в ближайшие дни рейсов нет.
            </p>
          </section>
        ) : mine ? (
          <TripCard arrival={mine} />
        ) : (
          <EtaHero arrival={first} stopName={first.stopName} distanceM={distanceTo(first.stopId)} />
        )}

        {others.length ? (
          <BoardSection title={mine ? "Если не успеете" : "Дальше с этой остановки"}>
            <ArrivalList>
              {others.map((a) => (
                <ArrivalRow key={`${a.tripId}:${a.stopId}`} arrival={a} today={now.date} />
              ))}
            </ArrivalList>
          </BoardSection>
        ) : null}

        {favoriteRoutes.length ? (
          <BoardSection
            title="Избранное"
            action={
              <Link href="/app/routes" className="text-sm font-semibold text-primary">
                Все маршруты
              </Link>
            }
          >
            <ul className="flex flex-wrap gap-2">
              {favoriteRoutes.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/app/routes/${f.routeId}`}
                    className="flex min-h-11 items-center gap-2 rounded-xl bg-card py-1.5 pr-3.5 pl-2 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <RouteBadge name={f.routeName!} color={f.routeColor} />
                    <span className="max-w-48 truncate">{f.routeDescription ?? "Маршрут"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </BoardSection>
        ) : null}

        {near.length ? (
          <BoardSection title="Остановки рядом">
            <MapPanel
              className="h-48 w-full overflow-hidden rounded-2xl"
              me={origin}
              stops={near.map((n) => ({
                id: n.stop.id,
                name: n.stop.name,
                lat: n.stop.lat,
                lng: n.stop.lng,
                note: formatDistance(n.distanceM),
                highlight: n.stop.id === heroStopId,
              }))}
            />
          </BoardSection>
        ) : null}
      </main>
    </>
  );
}
