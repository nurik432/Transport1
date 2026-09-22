"use client";

import { MapPanel } from "@/components/map";
import { LiveBadge, useTripLive } from "@/components/live-trip";
import { Card, SectionTitle, cx } from "@/components/ui";
import { IconBus, IconCheck } from "@/components/icons";

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

/** "через 7 мин" without pulling the server formatter into the client bundle. */
function inMinutes(total: number): string {
  if (total <= 0) return "подъезжает";
  if (total < 60) return `через ${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `через ${h} ч` : `через ${h} ч ${m} мин`;
}

function hhmm(iso: string | number | Date): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 50) * 50} м`;
  return `${(Math.round(m / 100) / 10).toFixed(1).replace(".", ",")} км`;
}

/**
 * Trip map and stop times. While the vehicle reports its position, both the
 * map and every stop time come from GPS; otherwise the schedule is used.
 */
export function TripLivePanel({
  tripId,
  active,
  stops,
  routeName,
  routeColor,
  routeLine,
  myStopId,
}: {
  tripId: string;
  active: boolean;
  stops: LiveStop[];
  routeName: string;
  routeColor: string;
  /** road geometry of the route; straight lines between stops when absent */
  routeLine?: [number, number][] | null;
  myStopId?: string;
}) {
  const live = useTripLive(tripId, active);
  const fresh = live.tracking === "live" || live.tracking === "stale";
  const myEta = myStopId ? live.etaByStop[myStopId] : undefined;

  return (
    <div className="flex flex-col gap-5">
      {active ? (
        <div className="flex items-center justify-between gap-2">
          <LiveBadge tracking={live.tracking} />
          {live.tracking === "none" ? (
            <span className="text-xs text-muted-foreground">Водитель ещё не передаёт координаты</span>
          ) : null}
        </div>
      ) : null}

      {fresh && myEta && !myEta.passed ? (
        <Card className={cx("flex items-center gap-3", myEta.minutesFromNow <= 5 && "border-primary bg-primary-soft/40")}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
            <IconBus className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-primary">{inMinutes(myEta.minutesFromNow)}</p>
            <p className="text-xs text-muted-foreground">
              По данным GPS · осталось {formatDistance(myEta.distanceM)} до вашей остановки
            </p>
          </div>
        </Card>
      ) : null}

      <MapPanel
        className="h-56 w-full rounded-[--radius-card] border border-border"
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

      <section>
        <SectionTitle>Остановки и время</SectionTitle>
        <Card className="p-0">
          <ol className="flex flex-col">
            {stops.map((s, i) => {
              const eta = fresh ? live.etaByStop[s.stopId] : undefined;
              const passed = Boolean(s.arrivedAt) || Boolean(eta?.passed);
              const isMine = s.stopId === myStopId;

              const delayMin = s.arrivedAt
                ? Math.round((new Date(s.arrivedAt).getTime() - new Date(s.plannedAt).getTime()) / 60_000)
                : null;

              // Prefer the arrival the driver marked, then GPS, then the schedule.
              const shownTime = s.arrivedAt
                ? hhmm(s.arrivedAt)
                : eta && !eta.passed
                  ? hhmm(eta.arrivalAt)
                  : hhmm(s.plannedAt);

              return (
                <li
                  key={s.stopId}
                  className={cx(
                    "flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0",
                    isMine && "bg-primary-soft/40",
                  )}
                >
                  <div className="flex flex-col items-center self-stretch pt-1">
                    <span
                      className="size-3 rounded-full border-2"
                      style={{ borderColor: routeColor, backgroundColor: passed ? routeColor : "#fff" }}
                    />
                    {i < stops.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className={cx("text-sm", isMine ? "font-semibold" : "font-medium")}>
                      {i + 1}. {s.name}
                      {isMine ? " · ваша остановка" : ""}
                    </p>
                    {s.waiting > 0 ? <p className="text-xs text-muted-foreground">Ожидают: {s.waiting}</p> : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">{shownTime}</p>
                    {s.arrivedAt ? (
                      <p className="flex items-center justify-end gap-0.5 text-xs text-muted-foreground">
                        <IconCheck className="size-3" />
                        {delayMin && delayMin > 0 ? `+${delayMin} мин` : "по плану"}
                      </p>
                    ) : eta && !eta.passed ? (
                      <p className="text-xs text-primary">{inMinutes(eta.minutesFromNow)}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
        {fresh ? (
          <p className="mt-2 text-xs text-muted-foreground">Время рассчитано по текущему положению транспорта.</p>
        ) : null}
      </section>
    </div>
  );
}
