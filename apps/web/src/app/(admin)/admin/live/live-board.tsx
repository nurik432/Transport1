"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPanel, type MapLine, type MapStop } from "@/components/map";
import { Segmented } from "@/components/admin-ui";
import { EmptyState, RouteBadge, cx } from "@/components/ui";
import { durationLabel } from "@transport/domain";

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
  capacity: number | null;
  nextStopName: string | null;
  nextStopEtaMin: number | null;
  delayMin: number | null;
}

export interface LiveSignalDto {
  kind: "off_route" | "no_tracking" | "not_started";
  tripId: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  startTime: string;
  driverName: string | null;
  vehicleNumber: string | null;
  booked: number;
  lateMin: number | null;
  offRouteM: number | null;
  silentSec: number | null;
  title: string;
  details: string;
}

/** Distance from the route line that the map and the list both treat as a problem. */
const OFF_ROUTE_M = 300;

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function silenceLabel(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 1 ? "нет GPS" : `нет GPS ${durationLabel(min)}`;
}

/** "вовремя" / "+4 мин" / "−2 мин": the sign is the whole message. */
function delayLabel(delayMin: number | null): string {
  if (delayMin === null) return "график неизвестен";
  if (delayMin >= 2) return `+${delayMin} мин`;
  if (delayMin <= -2) return `${delayMin} мин`;
  return "вовремя";
}

type Tab = "all" | "attention" | "not_started";

/**
 * Live operations board. The map owns the screen and the list on the right
 * answers, for every vehicle, the two questions asked while trips are running:
 * where is it going next and is anything wrong with it.
 */
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
  const [tab, setTab] = useState<Tab>("all");

  // A "?trip=" link from an attention card picks the vehicle; clicking the list
  // afterwards overrides it, until a new link arrives.
  const params = useSearchParams();
  const requestedTrip = params.get("trip");
  const [selected, setSelected] = useState<string | null>(requestedTrip);
  const [lastRequested, setLastRequested] = useState(requestedTrip);
  if (lastRequested !== requestedTrip) {
    setLastRequested(requestedTrip);
    setSelected(requestedTrip);
  }

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

  const notStarted = useMemo(() => signals.filter((s) => s.kind === "not_started"), [signals]);

  // A vehicle needs attention when it left the line or stopped reporting.
  const rows = useMemo(() => {
    const running = vehicles.map((v) => ({
      v,
      attention: (v.offRouteM ?? 0) > OFF_ROUTE_M || v.tracking !== "live",
    }));
    running.sort((a, b) => {
      if (a.attention !== b.attention) return a.attention ? -1 : 1;
      return a.v.startTime.localeCompare(b.v.startTime);
    });
    return running;
  }, [vehicles]);

  const visible = tab === "attention" ? rows.filter((r) => r.attention) : tab === "not_started" ? [] : rows;
  const visibleNotStarted = tab === "not_started" || tab === "all" ? notStarted : [];

  const selectedVehicle = vehicles.find((v) => v.tripId === selected) ?? null;

  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-col lg:h-dvh lg:flex-row">
      <div className="relative h-[22rem] shrink-0 lg:h-full lg:flex-1">
        <MapPanel
          className="h-[22rem] w-full lg:h-full"
          expandable={false}
          autoFit
          follow={selectedVehicle ? { lat: selectedVehicle.lat, lng: selectedVehicle.lng } : null}
          onUserMove={() => setSelected(null)}
          stops={stops}
          lines={lines}
          vehicles={vehicles.map((v) => ({
            id: v.tripId,
            lat: v.lat,
            lng: v.lng,
            label: `${v.routeName} · ${v.startTime}`,
            color: v.routeColor,
            stale: v.tracking !== "live",
            alert: (v.offRouteM ?? 0) > OFF_ROUTE_M,
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
        <span className="pointer-events-none absolute top-4 left-4 z-[400] rounded-[10px] bg-card px-3 py-2 text-[13px] font-semibold shadow-[0_2px_8px_rgba(11,22,38,0.12)]">
          {updatedAt ? `Обновлено в ${hhmm(updatedAt)}` : "Обновляется каждые 15 секунд"}
        </span>
      </div>

      <aside
        aria-label="Транспорт на линии"
        className="flex w-full shrink-0 flex-col gap-3.5 border-t border-border bg-card p-5 lg:h-full lg:w-95 lg:overflow-y-auto lg:border-t-0 lg:border-l"
      >
        <h1 className="text-2xl font-extrabold">Мониторинг</h1>

        <Segmented
          label="Фильтр"
          active={tab}
          onSelect={(key) => setTab(key as Tab)}
          items={[
            { key: "all", label: "Все", count: rows.length + notStarted.length },
            { key: "attention", label: "Внимание", count: rows.filter((r) => r.attention).length },
            { key: "not_started", label: "Не выехали", count: notStarted.length },
          ]}
        />

        {visible.length === 0 && visibleNotStarted.length === 0 ? (
          <EmptyState
            title={tab === "all" ? "Сейчас нет активных рейсов" : "В этой группе пусто"}
            hint={
              tab === "all"
                ? "Как только водитель начнёт рейс и включит геолокацию, транспорт появится на карте."
                : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {visibleNotStarted.map((s) => (
              <li key={`ns:${s.tripId}`}>
                <div className="flex flex-col gap-2 rounded-[14px] p-3.5 shadow-[inset_0_0_0_2px_var(--color-warn-border)]">
                  <div className="flex items-center gap-2.5">
                    <RouteBadge name={s.routeName} color={s.routeColor} />
                    <span className="flex-1 text-[15px] font-bold">Рейс {s.startTime}</span>
                    <span className="rounded-md bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn-foreground">
                      не выехал
                    </span>
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {s.lateMin !== null ? `Отправление было ${durationLabel(s.lateMin)} назад` : "Отправление пропущено"}
                    {s.driverName ? ` · ${s.driverName}` : ""}
                    {s.booked > 0 ? ` · записались ${s.booked}` : ""}
                  </p>
                </div>
              </li>
            ))}

            {visible.map(({ v, attention }) => {
              const offRoute = (v.offRouteM ?? 0) > OFF_ROUTE_M;
              const isSelected = v.tripId === selected;
              return (
                <li key={v.tripId}>
                  <button
                    type="button"
                    onClick={() => setSelected(isSelected ? null : v.tripId)}
                    aria-pressed={isSelected}
                    className={cx(
                      "flex w-full cursor-pointer flex-col gap-2 rounded-[14px] p-3.5 text-left transition-colors",
                      attention
                        ? "shadow-[inset_0_0_0_2px_var(--color-warn-border)]"
                        : "bg-background hover:bg-muted",
                      isSelected && "outline-2 outline-offset-2 outline-primary",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <RouteBadge name={v.routeName} color={v.routeColor} />
                      <span className="flex-1 text-[15px] font-bold">Рейс {v.startTime}</span>
                      {offRoute ? (
                        <span className="rounded-md bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn-foreground">
                          {Math.round(v.offRouteM!)} м от линии
                        </span>
                      ) : v.tracking !== "live" ? (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-body">
                          {silenceLabel(v.recordedAt)}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-ok">● на связи</span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      {v.nextStopName ? (
                        <>
                          Следующая: {v.nextStopName}
                          {v.nextStopEtaMin !== null ? ` · через ${v.nextStopEtaMin} мин` : ""} ·{" "}
                          {delayLabel(v.delayMin)} · {v.bookedTotal}
                          {v.capacity ? `/${v.capacity}` : ""}
                        </>
                      ) : (
                        <>
                          Последняя отметка в {hhmm(v.recordedAt)}
                          {v.driverName ? ` · ${v.driverName}` : ""} · {v.bookedTotal}
                          {v.capacity ? `/${v.capacity}` : ""}
                        </>
                      )}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-auto pt-2 text-xs text-muted-foreground">
          Обновляется каждые 15 секунд. Координаты записываются только во время выполняемого рейса.
        </p>
      </aside>
    </div>
  );
}
