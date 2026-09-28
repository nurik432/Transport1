"use client";

import { Card, SectionTitle, cx } from "@/components/ui";
import { formatKm, type VersionSummary } from "./types";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Dushanbe",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** History of the route's shape. Read-only: finished trips hang off these rows. */
export function VersionsCard({ versions }: { versions: VersionSummary[] }) {
  return (
    <Card>
      <SectionTitle>Версии маршрута</SectionTitle>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">История пока пуста.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {versions.map((v) => (
            <li
              key={v.id}
              className={cx(
                "rounded-lg border p-3 text-sm",
                v.isCurrent ? "border-primary bg-primary-soft/30" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">Версия {v.version}</span>
                {v.isCurrent ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-on-primary">
                    действует
                  </span>
                ) : null}
                <span className="text-muted-foreground">{formatWhen(v.createdAt)}</span>
                {v.createdByName ? <span className="text-muted-foreground">· {v.createdByName}</span> : null}
              </div>

              {v.note ? <p className="mt-1">{v.note}</p> : null}

              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground tabular-nums">
                <span>остановок {v.stopCount}</span>
                <span>рейсов {v.tripCount}</span>
                {v.completedTripCount > 0 ? <span>завершено {v.completedTripCount}</span> : null}
                {v.pathSource === "road" && v.pathDistanceM ? <span>{formatKm(v.pathDistanceM)} по дорогам</span> : null}
              </p>

              {v.stopNames.length ? (
                <p className="mt-1 text-xs text-muted-foreground">{v.stopNames.join(" → ")}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Старые версии не удаляются: завершённые рейсы остаются привязанными к той форме маршрута, по которой
        фактически ехали, поэтому история загрузки по остановкам не искажается.
      </p>
    </Card>
  );
}
