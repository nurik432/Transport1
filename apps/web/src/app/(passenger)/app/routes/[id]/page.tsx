import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMinutes, localNow, parseTimeToMinutes } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getFavorites, getRoute, getRouteTrips } from "@/lib/queries";
import { MobileHeader } from "@/components/mobile-shell";
import { MapPanel } from "@/components/map";
import { Card, RouteBadge, SectionTitle, cx } from "@/components/ui";
import { FavoriteButton } from "@/components/favorite-button";

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("passenger");
  const { id } = await params;
  const now = localNow();

  const route = await getRoute(id);
  if (!route) notFound();

  const [trips, favorites] = await Promise.all([getRouteTrips(route.id, now.date), getFavorites(user.id)]);
  const tripByTime = new Map(trips.map((t) => [t.startTime, t]));

  return (
    <>
      <MobileHeader
        title={`Маршрут ${route.name}`}
        subtitle={route.direction === "to_work" ? "Утро · на работу" : "Вечер · домой"}
        back="/app/routes"
        action={<FavoriteButton kind="route" id={route.id} active={favorites.routeIds.has(route.id)} />}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <p className="text-sm text-muted-foreground">{route.description}</p>

        <MapPanel
          className="h-60 w-full rounded-[--radius-card] border border-border"
          lines={[{ id: route.id, color: route.color, points: route.stops.map((s) => [s.lat, s.lng]) }]}
          stops={route.stops.map((s, i) => ({
            id: s.stopId,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            note: `Остановка ${i + 1}`,
            highlight: i === 0,
          }))}
        />

        <section>
          <SectionTitle>Расписание на сегодня</SectionTitle>
          {route.schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Расписание не задано.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {route.schedules.map((s) => {
                const trip = tripByTime.get(s.departureTime);
                const past = parseTimeToMinutes(s.departureTime) < now.minutes;
                const content = (
                  <span
                    className={cx(
                      "inline-flex min-h-11 min-w-20 items-center justify-center rounded-lg border px-3 text-sm font-semibold tabular-nums transition-colors",
                      past ? "border-border bg-muted text-muted-foreground" : "border-border bg-card hover:border-primary hover:text-primary",
                    )}
                  >
                    {s.departureTime}
                  </span>
                );
                return trip ? (
                  <Link key={s.id} href={`/app/trips/${trip.id}`}>
                    {content}
                  </Link>
                ) : (
                  <span key={s.id}>{content}</span>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Нажмите на время отправления, чтобы увидеть рейс по остановкам.</p>
        </section>

        <section>
          <SectionTitle>Остановки</SectionTitle>
          <Card className="p-0">
            <ol className="flex flex-col">
              {route.stops.map((s, i) => (
                <li key={s.stopId} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex flex-col items-center self-stretch pt-1">
                    <span
                      className="size-2.5 rounded-full border-2"
                      style={{ borderColor: route.color, backgroundColor: i === 0 ? route.color : "#fff" }}
                    />
                    {i < route.stops.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.address ? <p className="text-xs text-muted-foreground">{s.address}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    +{formatMinutes(s.offsetMin).replace("00:", "")} мин
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <RouteBadge name={route.name} color={route.color} className="text-xs" />
          Время указано как смещение от отправления.
        </p>
      </main>
    </>
  );
}
