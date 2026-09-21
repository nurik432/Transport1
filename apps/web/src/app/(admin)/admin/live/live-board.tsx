"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPanel, type MapLine, type MapStop } from "@/components/map";
import { Card, EmptyState, RouteBadge, SectionTitle, cx } from "@/components/ui";
import { IconAlert, IconBus } from "@/components/icons";

export interface LiveVehicleDto {
  tripId: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  direction: "to_work" | "from_work";
  startTime: string;
  vehicleNumber: string | null;
  driverName: string | null;
  lat: number;
  lng: number;
  speedKph: number | null;
  offRouteM: number | null;
  recordedAt: string;
  tracking: "live" | "stale" | "lost" | "none";
  bookedTotal: number;
}

export interface LiveSignalDto {
  kind: "off_route" | "no_tracking" | "not_started";
  tripId: string;
  routeName: string;
  startTime: string;
  driverName: string | null;
  vehicleNumber: string | null;
  title: string;
  details: string;
}

const TRACKING_LABEL: Record<LiveVehicleDto["tracking"], string> = {
  live: "на связи",
  stale: "данные устарели",
  lost: "связь потеряна",
  none: "нет данных",
};

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Live operations board: where the vehicles are and what needs attention. */
export function LiveBoard({
  stops,
  lines,
  initialVehicles,
  initialSignals,
}: {
  stops: MapStop[];
  lines: MapLine[];
  initialVehicles: LiveVehicleDto[];
  initialSignals: LiveSignalDto[];
}) {
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [signals, setSignals] = useState(initialSignals);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (force = false) => {
      if (!force && document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/v1/live/vehicles", { cache: "no-store" });
        if (!response.ok) return;
        const json = await response.json();
        if (cancelled || !json.ok) return;
        setVehicles(json.vehicles as LiveVehicleDto[]);
        setSignals(json.signals as LiveSignalDto[]);
        setUpdatedAt(json.at as string);
      } catch {
        // keep showing the previous snapshot
      }
    };

    const id = setInterval(() => void load(), 15_000);
    void load(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-3">
        <MapPanel
          className="h-[28rem] w-full rounded-[--radius-card] border border-border"
          stops={stops}
          lines={lines}
          vehicles={vehicles.map((v) => ({
            id: v.tripId,
            lat: v.lat,
            lng: v.lng,
            label: `${v.routeName} · ${v.startTime}`,
            color: v.routeColor,
            stale: v.tracking !== "live",
            alert: (v.offRouteM ?? 0) > 300,
            note: [
              v.vehicleNumber,
              v.driverName,
              v.speedKph != null ? `${Math.round(v.speedKph)} км/ч` : null,
              `обновлено ${hhmm(v.recordedAt)}`,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
        <p className="text-xs text-muted-foreground">
          Обновляется каждые 15 секунд{updatedAt ? ` · последнее обновление ${hhmm(updatedAt)}` : ""}. Позиции
          записываются только во время выполняемого рейса.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <section>
          <SectionTitle>Требует внимания</SectionTitle>
          {signals.length === 0 ? (
            <Card className="text-sm text-muted-foreground">Отклонений нет: все рейсы идут по маршруту.</Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {signals.map((s, i) => (
                <li key={`${s.tripId}:${s.kind}:${i}`}>
                  <Card
                    className={cx(
                      "flex gap-3",
                      s.kind === "off_route" ? "border-danger/40" : "border-warn/40",
                    )}
                  >
                    <IconAlert className={cx("mt-0.5 size-5 shrink-0", s.kind === "off_route" ? "text-danger" : "text-warn")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-sm text-muted-foreground">{s.details}</p>
                      <Link href={`/admin/trips?date=${new Date().toISOString().slice(0, 10)}`} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                        Открыть рейсы
                      </Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Транспорт в рейсе</SectionTitle>
          {vehicles.length === 0 ? (
            <EmptyState
              title="Сейчас нет активных рейсов"
              hint="Как только водитель начнёт рейс и включит геолокацию, транспорт появится на карте."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {vehicles.map((v) => (
                <li key={v.tripId}>
                  <Card className="flex items-center gap-3">
                    <RouteBadge name={v.routeName} color={v.routeColor} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {v.startTime} · {v.driverName ?? "водитель не назначен"}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <IconBus className="size-3.5" />
                          {v.vehicleNumber ?? "—"}
                        </span>
                        <span>·</span>
                        <span>{TRACKING_LABEL[v.tracking]}</span>
                        <span>·</span>
                        <span className="tabular-nums">пассажиров {v.bookedTotal}</span>
                      </p>
                    </div>
                    {(v.offRouteM ?? 0) > 300 ? (
                      <span className="rounded-full bg-danger-soft px-2 py-1 text-xs font-medium text-red-800">
                        {Math.round(v.offRouteM!)} м от маршрута
                      </span>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
