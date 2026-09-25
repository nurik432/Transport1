"use client";

import type { ReactNode } from "react";
import { MapPanel } from "@/components/map";
import { useTripLive } from "@/components/live-trip";
import { cx } from "@/components/ui";
import { IconBus } from "@/components/icons";

export interface LiveStop {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
  /** ISO timestamps so the component can compare and format them */
  plannedAt: string;
  arrivedAt: string | null;
  waiting: number;
}

type TripStatus = "planned" | "in_progress" | "completed" | "cancelled";

const STATUS_LABEL: Record<TripStatus, string> = {
  planned: "По расписанию",
  in_progress: "В пути",
  completed: "Завершён",
  cancelled: "Отменён",
};

/** "через 7 мин" without pulling the server formatter into the client bundle. */
function inMinutes(total: number): string {
  if (total <= 0) return "подъезжает";
  if (total < 60) return `через ${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `через ${h} ч` : `через ${h} ч ${m} мин`;
}

/** Server computes the instants; the client only formats them, in company time. */
function hhmm(iso: string | number | Date): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dushanbe" });
}

function secondsAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} с назад`;
  return `${Math.round(s / 60)} мин назад`;
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 50) * 50} м`;
  return `${(Math.round(m / 100) / 10).toFixed(1).replace(".", ",")} км`;
}

/**
 * Trip screen body: map on top, a status strip, then the stops as a timeline
 * with "the vehicle is here" and the passenger's own stop called out.
 * While the vehicle reports its position, times come from GPS; otherwise the
 * driver's marks, then the schedule.
 */
export function TripLivePanel({
  tripId,
  status,
  stops,
  routeName,
  routeColor,
  routeLine,
  myStopId,
  children,
}: {
  tripId: string;
  status: TripStatus;
  stops: LiveStop[];
  routeName: string;
  routeColor: string;
  /** road geometry of the route; straight lines between stops when absent */
  routeLine?: [number, number][] | null;
  myStopId?: string;
  /** booking card, shown under the stop list */
  children?: ReactNode;
}) {
  const active = status === "in_progress";
  const live = useTripLive(tripId, active);
  const fresh = live.tracking === "live" || live.tracking === "stale";

  const rows = stops.map((s) => {
    const eta = fresh ? live.etaByStop[s.stopId] : undefined;
    const passed = Boolean(s.arrivedAt) || Boolean(eta?.passed);
    const delayMin = s.arrivedAt
      ? Math.round((new Date(s.arrivedAt).getTime() - new Date(s.plannedAt).getTime()) / 60_000)
      : eta && !eta.passed
        ? Math.round((new Date(eta.arrivalAt).getTime() - new Date(s.plannedAt).getTime()) / 60_000)
        : 0;
    // Prefer the arrival the driver marked, then GPS, then the schedule.
    const shownTime = s.arrivedAt ? hhmm(s.arrivedAt) : eta && !eta.passed ? hhmm(eta.arrivalAt) : hhmm(s.plannedAt);
    return { s, eta, passed, delayMin, shownTime, isMine: s.stopId === myStopId };
  });

  // The vehicle sits between the last passed stop and the next one.
  const nextIndex = rows.findIndex((r) => !r.passed);
  const vehicleBefore = active && nextIndex > 0 ? nextIndex : -1;
  const upcoming = nextIndex >= 0 ? rows[nextIndex] : undefined;
  const lateNow = active && upcoming ? upcoming.delayMin : 0;

  return (
    <div className="flex flex-col gap-3">
      <MapPanel
        className="h-60 w-full overflow-hidden rounded-2xl"
        lines={[
          {
            id: tripId,
            color: routeColor,
            points: routeLine ?? stops.map((s) => [s.lat, s.lng] as [number, number]),
          },
        ]}
        stops={stops.map((s) => ({
          id: s.stopId,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          note: s.arrivedAt ? hhmm(s.arrivedAt) : hhmm(s.plannedAt),
          highlight: s.stopId === myStopId,
        }))}
        vehicles={
          live.position
            ? [
                {
                  id: tripId,
                  lat: live.position.lat,
                  lng: live.position.lng,
                  label: `Маршрут ${routeName}`,
                  color: routeColor,
                  stale: live.tracking !== "live",
                  note: `Обновлено ${hhmm(live.position.recordedAt)}`,
                },
              ]
            : []
        }
      />

      <div className="flex items-center gap-2.5 rounded-xl bg-card px-3.5 py-2.5 text-sm">
        <span
          aria-hidden="true"
          className={cx(
            active && live.tracking === "live" ? "live-dot text-ok" : "size-2 rounded-full",
            !(active && live.tracking === "live") &&
              (status === "cancelled" ? "bg-danger" : active ? "bg-warn" : "bg-muted-foreground"),
          )}
        />
        <span className="min-w-0 flex-1">
          <strong className="font-semibold">{STATUS_LABEL[status]}</strong>
          {active
            ? live.tracking === "live" && live.position
              ? ` · GPS обновлён ${secondsAgo(live.position.recordedAt)}`
              : live.tracking === "stale"
                ? " · GPS давно не обновлялся"
                : " · время по отметкам водителя"
            : null}
        </span>
        {lateNow >= 2 ? (
          <span className="rounded-md bg-late-soft px-2 py-0.5 text-xs font-semibold text-late">+{lateNow} мин</span>
        ) : null}
      </div>

      <ol aria-label="Остановки рейса" className="flex flex-col rounded-2xl bg-card px-3.5 py-1.5">
        {rows.map((r, i) => (
          <StopRowWithVehicle
            key={r.s.stopId}
            showVehicle={i === vehicleBefore}
            row={r}
            last={i === rows.length - 1}
            routeColor={routeColor}
          />
        ))}
      </ol>

      {children}
    </div>
  );
}

function StopRowWithVehicle({
  showVehicle,
  row,
  last,
  routeColor,
}: {
  showVehicle: boolean;
  row: {
    s: LiveStop;
    eta?: { minutesFromNow: number; distanceM: number; passed: boolean };
    passed: boolean;
    delayMin: number;
    shownTime: string;
    isMine: boolean;
  };
  last: boolean;
  routeColor: string;
}) {
  const { s, eta, passed, delayMin, shownTime, isMine } = row;
  return (
    <>
      {showVehicle ? (
        <li className="grid min-h-8 grid-cols-[24px_1fr] items-center gap-x-3">
          <span className="flex size-6 items-center justify-center justify-self-center rounded-md bg-ink text-on-ink">
            <IconBus className="size-3.5" />
          </span>
          <span className="text-sm font-semibold text-ink">Транспорт сейчас здесь</span>
        </li>
      ) : null}
      <li
        className={cx(
          "grid grid-cols-[24px_1fr_auto] items-center gap-x-3",
          isMine ? "-mx-2 my-1 min-h-16 rounded-xl bg-highlight-soft px-2" : "min-h-11",
        )}
      >
        {isMine ? (
          <span className="size-4.5 justify-self-center rounded-full border-3 border-card bg-highlight ring-1 ring-highlight" />
        ) : last ? (
          <span
            className={cx("size-3.5 justify-self-center rounded", passed && "opacity-40")}
            style={{ backgroundColor: routeColor }}
          />
        ) : (
          <span
            className={cx("size-3 justify-self-center rounded-full border-3", passed && "opacity-40")}
            style={passed ? { borderColor: routeColor, backgroundColor: routeColor } : { borderColor: routeColor }}
          />
        )}

        <span className="flex min-w-0 flex-col">
          <span
            className={cx(
              "truncate",
              isMine ? "text-[15px] font-bold" : passed ? "text-sm text-muted-foreground" : "text-sm",
              last && !isMine && "font-semibold",
            )}
          >
            {s.name}
          </span>
          {isMine ? (
            <span className="text-xs font-semibold text-late">
              Ваша остановка{delayMin >= 2 ? ` · план ${hhmm(s.plannedAt)}` : ""}
              {eta && !eta.passed && eta.distanceM > 0 ? ` · ${formatDistance(eta.distanceM)}` : ""}
            </span>
          ) : s.waiting > 0 && !passed ? (
            <span className="text-xs text-muted-foreground">Ожидают: {s.waiting}</span>
          ) : null}
        </span>

        <span className="flex flex-col items-end">
          {passed ? (
            <span className="text-[13px] text-muted-foreground">
              {s.arrivedAt && delayMin > 0 ? (
                <>
                  <s>{hhmm(s.plannedAt)}</s> {shownTime}
                </>
              ) : (
                shownTime
              )}
            </span>
          ) : (
            <span className={cx("font-semibold", isMine ? "text-[17px] font-extrabold" : "text-sm")}>{shownTime}</span>
          )}
          {!passed && eta && !eta.passed && isMine ? (
            <span className="text-xs text-highlight-foreground">{inMinutes(eta.minutesFromNow)}</span>
          ) : null}
        </span>
      </li>
    </>
  );
}
