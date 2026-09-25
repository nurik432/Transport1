import Link from "next/link";
import { localNow, parseTimeToMinutes } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getFavorites, getRoutesDayStatus, listRoutes } from "@/lib/queries";
import { cx } from "@/components/ui";
import { RoutesList, type RouteListItem } from "./routes-list";

/** A planned trip whose departure is this far in the past is treated as gone. */
const MISSED_GRACE_MIN = 5;

export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ dir?: string }> }) {
  const user = await requireRole("passenger");
  const { dir } = await searchParams;
  const now = localNow();
  const direction = dir === "from_work" || dir === "to_work" ? dir : now.minutes < 12 * 60 ? "to_work" : "from_work";

  const [routes, favorites] = await Promise.all([listRoutes(true), getFavorites(user.id)]);
  const visible = routes.filter((r) => r.direction === direction);
  const dayStatus = await getRoutesDayStatus(
    visible.map((r) => r.id),
    now.date,
    now.instant,
  );

  const items: RouteListItem[] = visible.map((route) => {
    const status = dayStatus.get(route.id);
    const fromTrips = (status?.upcoming ?? [])
      .filter((t) => t.status === "in_progress" || parseTimeToMinutes(t.startTime) >= now.minutes - MISSED_GRACE_MIN)
      .map((t) => ({ time: t.startTime, live: t.status === "in_progress" }));
    // No trips generated for today yet: fall back to the published schedule.
    const fromSchedule = route.schedules
      .filter((s) => s.active && s.daysOfWeek.includes(now.weekday) && parseTimeToMinutes(s.departureTime) >= now.minutes)
      .map((s) => ({ time: s.departureTime, live: false }));
    const departures = (fromTrips.length ? fromTrips : fromSchedule).slice(0, 3);

    return {
      id: route.id,
      name: route.name,
      description: route.description,
      color: route.color,
      stopCount: route.stops.length,
      favorite: favorites.routeIds.has(route.id),
      searchText: [route.name, route.description ?? "", ...route.stops.map((s) => s.name)].join(" ").toLowerCase(),
      departures,
      cancelled: status?.cancelled ?? [],
      changedRecently: status?.changedRecently ?? false,
    };
  });

  return (
    <>
      <header className="mx-auto w-full max-w-md px-5 pt-5 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">Маршруты</h1>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-4">
        <nav aria-label="Направление" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(
            [
              { key: "to_work", label: "Утро · на работу" },
              { key: "from_work", label: "Вечер · домой" },
            ] as const
          ).map((tab) => (
            <Link
              key={tab.key}
              href={`/app/routes?dir=${tab.key}`}
              aria-current={direction === tab.key ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center justify-center rounded-lg text-sm transition-colors",
                direction === tab.key
                  ? "bg-card font-bold text-foreground shadow-xs"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <RoutesList routes={items} />
      </main>
    </>
  );
}
