import Link from "next/link";
import { localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { getFavorites, listRoutes } from "@/lib/queries";
import { MobileHeader } from "@/components/mobile-shell";
import { Card, EmptyState, RouteBadge, cx } from "@/components/ui";
import { IconChevronRight, IconClock, IconStar } from "@/components/icons";

export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ dir?: string }> }) {
  const user = await requireRole("passenger");
  const { dir } = await searchParams;
  const now = localNow();
  const direction = dir === "from_work" || dir === "to_work" ? dir : now.minutes < 12 * 60 ? "to_work" : "from_work";

  const [routes, favorites] = await Promise.all([listRoutes(true), getFavorites(user.id)]);
  const visible = routes.filter((r) => r.direction === direction);

  return (
    <>
      <MobileHeader title="Маршруты" subtitle="Корпоративный транспорт" />
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <div role="tablist" aria-label="Направление" className="flex gap-1 rounded-lg bg-muted p-1">
          {(
            [
              { key: "to_work", label: "Утро · на работу" },
              { key: "from_work", label: "Вечер · домой" },
            ] as const
          ).map((tab) => (
            <Link
              key={tab.key}
              role="tab"
              aria-selected={direction === tab.key}
              href={`/app/routes?dir=${tab.key}`}
              className={cx(
                "flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors duration-200",
                direction === tab.key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState title="Маршрутов нет" hint="В этом направлении пока нет активных маршрутов." />
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((route) => (
              <li key={route.id}>
                <Link href={`/app/routes/${route.id}`} className="block">
                  <Card className="flex items-center gap-3 transition-colors hover:bg-muted">
                    <RouteBadge name={route.name} color={route.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{route.description ?? "Маршрут"}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <IconClock className="size-3.5" />
                        {route.schedules.length ? route.schedules.map((s) => s.departureTime).join(" · ") : "Расписание не задано"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{route.stops.length} остановок</p>
                    </div>
                    {favorites.routeIds.has(route.id) ? (
                      <IconStar className="size-4 fill-current text-accent" aria-label="В избранном" />
                    ) : null}
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
