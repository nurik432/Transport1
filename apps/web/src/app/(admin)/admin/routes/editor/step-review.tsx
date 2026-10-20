"use client";

import { formatMinutes, parseTimeToMinutes, plural } from "@transport/domain";
import { MapPanel } from "@/components/map";
import { Panel, RouteBadge } from "@/components/ui";
import { WEEKDAYS, formatKm } from "./types";
import type { RouteEditor } from "./use-route-editor";
import type { RoutePath } from "./use-route-path";

/**
 * The last look before the route goes live.
 *
 * The timetable below is the point of this step: offsets in minutes are hard to
 * check, actual clock times are not. It is the only place in the app that shows
 * a route the way a passenger will experience it.
 */
export function StepReview({ editor, path }: { editor: RouteEditor; path: RoutePath }) {
  const { value } = editor;
  const sorted = [...value.departures].sort((a, b) => a.time.localeCompare(b.time));
  const first = sorted[0]?.time;
  const withVehicles = (d: { time: string; vehicles: number }) =>
    d.vehicles > 1 ? `${d.time} (${d.vehicles} ${plural(d.vehicles, ["машина", "машины", "машин"])})` : d.time;
  const days = WEEKDAYS.filter((d) => value.daysOfWeek.includes(d.value))
    .map((d) => d.label)
    .join(", ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <RouteBadge name={value.name || "№"} color={value.color} size="md" />
        <span>{value.direction === "to_work" ? "Утро · на работу" : "Вечер · домой"}</span>
        <span className="text-muted-foreground">
          {value.status === "active" ? "Активен" : value.status === "draft" ? "Черновик" : "Отключён"}
        </span>
        {path.source === "road" && path.distanceM !== null ? (
          <span className="text-muted-foreground">{formatKm(path.distanceM)} по дорогам</span>
        ) : null}
      </div>

      <p className="text-sm">{value.stops.map((s) => s.name).join(" → ")}</p>

      <MapPanel
        className="h-72 w-full rounded-[--radius-card] border border-border"
        stops={value.stops.map((s, i) => ({ id: s.uid, name: s.name, lat: s.lat, lng: s.lng, order: i + 1 }))}
        lines={
          value.stops.length >= 2
            ? [
                {
                  id: "review",
                  color: value.color,
                  points: path.points ?? value.stops.map((s) => [s.lat, s.lng] as [number, number]),
                  dashed: path.points === null || path.source === "straight",
                },
              ]
            : []
        }
      />

      {first ? (
        <div>
          <p className="mb-2 text-sm font-medium">Во сколько где будет · отправление {first}</p>
          <ol className="flex flex-col gap-1 text-sm">
            {value.stops.map((s, i) => (
              <li key={s.uid} className="flex items-center gap-3">
                <span className="w-14 shrink-0 font-semibold tabular-nums">
                  {formatMinutes(parseTimeToMinutes(first) + s.offsetMin)}
                </span>
                <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                <span>{s.name}</span>
              </li>
            ))}
          </ol>
          {sorted.length > 1 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Остальные отправления: {sorted.slice(1).map(withVehicles).join(", ")} — те же смещения.
            </p>
          ) : null}
          {sorted.some((d) => d.vehicles > 1) ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Несколько машин на одно время: {sorted.filter((d) => d.vehicles > 1).map(withVehicles).join(", ")}. Каждая —
              отдельный рейс со своим водителем, пассажир выбирает машину сам.
            </p>
          ) : null}
        </div>
      ) : (
        <Panel tone="warn" className="p-3 text-sm">
          Отправления не заданы, поэтому рейсов не будет. Вернитесь на шаг «Расписание».
        </Panel>
      )}

      <p className="text-sm text-muted-foreground">Дни недели: {days || "не отмечены"}</p>
    </div>
  );
}
