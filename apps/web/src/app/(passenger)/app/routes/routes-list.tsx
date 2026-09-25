"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RouteBadge, cx } from "@/components/ui";
import { IconStar } from "@/components/icons";

export interface RouteListItem {
  id: string;
  name: string;
  description: string | null;
  color: string;
  stopCount: number;
  favorite: boolean;
  /** lowercased route number, description and stop names, for search */
  searchText: string;
  departures: { time: string; live: boolean }[];
  cancelled: string[];
  changedRecently: boolean;
}

function RouteCard({ route }: { route: RouteListItem }) {
  return (
    <li>
      <Link
        href={`/app/routes/${route.id}`}
        className="flex flex-col gap-2.5 rounded-2xl bg-card p-3.5 transition-colors hover:bg-muted"
      >
        <span className="flex items-center gap-3">
          <RouteBadge name={route.name} color={route.color} size="md" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{route.description ?? "Маршрут"}</span>
          {route.cancelled.length ? (
            <span className="shrink-0 rounded-md bg-danger-soft px-2 py-0.5 text-xs font-bold text-red-800">
              Отменён {route.cancelled[0]}
            </span>
          ) : route.changedRecently ? (
            <span className="shrink-0 rounded-md bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">Изменён</span>
          ) : null}
          {route.favorite ? (
            <IconStar className="size-5 fill-highlight text-late" aria-label="В избранном" role="img" aria-hidden={false} />
          ) : null}
        </span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {route.departures.length ? (
            route.departures.map((d) => (
              <span
                key={d.time}
                className={cx(
                  "rounded-md px-2 py-0.5 font-semibold",
                  d.live ? "bg-ink text-on-ink" : "bg-primary-soft text-ink",
                )}
              >
                {d.time}
                {d.live ? " в пути" : ""}
              </span>
            ))
          ) : (
            <span>Сегодня рейсов больше нет</span>
          )}
          <span className="ml-auto shrink-0">{route.stopCount} ост.</span>
        </span>
      </Link>
    </li>
  );
}

export function RoutesList({ routes }: { routes: RouteListItem[] }) {
  const [query, setQuery] = useState("");

  const { favorites, others } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q ? routes.filter((r) => r.searchText.includes(q)) : routes;
    return { favorites: shown.filter((r) => r.favorite), others: shown.filter((r) => !r.favorite) };
  }, [routes, query]);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 focus-within:border-primary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-5 shrink-0 text-muted-foreground" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="sr-only">Поиск по остановке или номеру маршрута</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Остановка или номер маршрута"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </label>

      {favorites.length === 0 && others.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {query ? "Ничего не нашлось. Попробуйте другое название остановки." : "В этом направлении пока нет активных маршрутов."}
        </p>
      ) : null}

      {favorites.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="mx-1 text-sm font-semibold text-muted-foreground">Избранные</h2>
          <ul className="flex flex-col gap-2.5">
            {favorites.map((r) => (
              <RouteCard key={r.id} route={r} />
            ))}
          </ul>
        </section>
      ) : null}

      {others.length ? (
        <section className="flex flex-col gap-2">
          {favorites.length ? <h2 className="mx-1 mt-1 text-sm font-semibold text-muted-foreground">Все маршруты</h2> : null}
          <ul className="flex flex-col gap-2.5">
            {others.map((r) => (
              <RouteCard key={r.id} route={r} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
