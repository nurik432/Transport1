"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  durationLabel,
  etaOnPath,
  formatDistance,
  plannedSpeedOnPath,
  plural,
  preparePath,
  projectOnPath,
  type LatLng,
} from "@transport/domain";
import { MapPanel, type MapLine, type MapStop } from "@/components/map";
import { RouteBadge, cx } from "@/components/ui";
import { IconAlert, IconArrowLeft, IconUsers } from "@/components/icons";
import { googleMapsRoute, yandexMapsRoute } from "@/lib/nav-links";
import { departStop, finishTrip, markArrival, setHeadcount } from "../../actions";
import { PositionTracker, type TrackerStatus } from "./position-tracker";

export interface DriveStop {
  stopId: string;
  name: string;
  seq: number;
  offsetMin: number;
  lat: number;
  lng: number;
  roadDistanceM: number | null;
  /** scheduled arrival, ISO — the clock the delay is measured against */
  plannedAt: string;
  plannedLabel: string;
  arrivedLabel: string | null;
  arrived: boolean;
  departed: boolean;
  boarded: number;
  alighted: number;
  waiting: number;
  waitingNames: string[];
}

interface Fix extends LatLng {
  accuracyM: number;
  speedKph: number | null;
}

const PASSED_COLOR = "#94a3b8";
/** GPS noise around a stop: beyond this the stop counts as driven past. */
const STOP_PASSED_M = 50;
/** A tap is ignored for this long, so two taps never skip a stop. */
const TAP_LOCK_MS = 1000;

/**
 * "+2 мин" behind the timetable, "−3 мин" ahead of it, nothing when on time.
 * Hours once it runs into them, so a stale trip does not shout "+528 мин".
 */
function delayPill(delayMin: number | null): string | null {
  if (delayMin === null || Math.abs(delayMin) < 2) return null;
  const size = Math.abs(delayMin) < 60 ? `${Math.abs(delayMin)} мин` : durationLabel(Math.abs(delayMin));
  return `${delayMin > 0 ? "+" : "−"}${size}`;
}

/** "Ждёт 1 человек" / "Ждут 6 человек". */
function waitingLabel(n: number): string {
  return `${n === 1 ? "Ждёт" : "Ждут"} ${n} ${plural(n, ["человек", "человека", "человек"])}`;
}

/**
 * The screen the driver looks at between the road and the mirrors. One stop,
 * one button, dark background — trips run at dawn and at dusk.
 *
 * It has two states and switches between them by itself: driving towards a stop
 * and standing at one. "Прибыл" and "Отправиться" never share a colour, so a
 * double tap cannot silently skip a stop.
 */
export function DrivingScreen({
  tripId,
  routeName,
  routeColor,
  startTime,
  capacity,
  path,
  stops,
  offRouteThresholdM,
  serverNow,
}: {
  tripId: string;
  routeName: string;
  routeColor: string;
  startTime: string;
  capacity: number | null;
  path: [number, number][] | null;
  stops: DriveStop[];
  offRouteThresholdM: number;
  /** the server's clock at render, ISO: the countdown starts from it */
  serverNow: string;
}) {
  const [fix, setFix] = useState<Fix | null>(null);
  // The minutes to the next stop have to count down on their own; reading the
  // clock during render would be impure, so it ticks here.
  const [nowMs, setNowMs] = useState(() => new Date(serverNow).getTime());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const [gps, setGps] = useState<TrackerStatus>("starting");
  const [sheet, setSheet] = useState<null | "stops" | "navigator" | "finish">(null);
  const [showWaiting, setShowWaiting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pending, start] = useTransition();

  useWakeLock();

  const onFix = useCallback((pos: GeolocationPosition) => {
    setFix({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? Infinity,
      speedKph: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : null,
    });
  }, []);

  const atStop = stops.find((s) => s.arrived && !s.departed) ?? null;
  const nextStop = stops.find((s) => !s.arrived) ?? null;
  const afterNext = nextStop ? (stops.find((s) => !s.arrived && s.seq > nextStop.seq) ?? null) : null;
  // Which stop the screen is about: the one we stand at, otherwise the one ahead.
  const focusStop = atStop ?? nextStop;
  const position = focusStop ? stops.indexOf(focusStop) + 1 : stops.length;

  // Counters for the stop the bus is standing at. "Сели" starts at the number
  // who booked this stop: usually right, and one tap away when it is not.
  const [editing, setEditing] = useState(atStop?.stopId ?? null);
  const [boarded, setBoarded] = useState(atStop ? (atStop.boarded || atStop.waiting) : 0);
  const [alighted, setAlighted] = useState(atStop?.alighted ?? 0);
  if (atStop && atStop.stopId !== editing) {
    setEditing(atStop.stopId);
    setBoarded(atStop.boarded || atStop.waiting);
    setAlighted(atStop.alighted);
  }

  const points = useMemo<LatLng[]>(
    () =>
      path && path.length >= 2
        ? path.map(([lat, lng]) => ({ lat, lng }))
        : stops.map(({ lat, lng }) => ({ lat, lng })),
    [path, stops],
  );
  const prepared = useMemo(
    () =>
      preparePath(
        points,
        stops.map((s) => ({
          stopId: s.stopId,
          seq: s.seq,
          offsetMin: s.offsetMin,
          lat: s.lat,
          lng: s.lng,
          distanceM: s.roadDistanceM,
        })),
      ),
    [points, stops],
  );

  const projection = useMemo(() => (fix && prepared ? projectOnPath(fix, prepared) : null), [fix, prepared]);
  const offRouteM = projection?.offRouteM ?? null;
  const onRoute = offRouteM !== null && offRouteM <= offRouteThresholdM;
  // A coarse (network) fix cannot tell a detour from its own error margin.
  const offRoute =
    offRouteM !== null && offRouteM > offRouteThresholdM && (fix?.accuracyM ?? Infinity) <= offRouteThresholdM;

  // Live arrival at the next stop, from this device's own position.
  const eta = useMemo(() => {
    if (!fix || !prepared || !nextStop || !onRoute) return null;
    const at = new Date(nowMs);
    return etaOnPath({
      position: { lat: fix.lat, lng: fix.lng, recordedAt: at, speedKph: fix.speedKph },
      path: prepared,
      projection,
      targetStopId: nextStop.stopId,
      now: at,
      fallbackSpeedKph: plannedSpeedOnPath(prepared),
    });
  }, [fix, prepared, projection, nextStop, onRoute, nowMs]);

  // The big number is the anchor of the screen, so it always says something:
  // the live estimate when GPS works, the timetable when it does not.
  const minutesToNext = useMemo(() => {
    if (eta) return Math.max(1, eta.minutesFromNow);
    if (!nextStop) return null;
    const left = Math.round((new Date(nextStop.plannedAt).getTime() - nowMs) / 60_000);
    return left > 0 ? left : 0;
  }, [eta, nextStop, nowMs]);

  const nextOnPath = nextStop && prepared ? prepared.stops.find((p) => p.stopId === nextStop.stopId) : undefined;
  const toNextM = onRoute && projection && nextOnPath ? nextOnPath.distanceM - projection.alongM : null;
  const drivenPast = toNextM !== null && toNextM < -STOP_PASSED_M;

  const delayMin = useMemo(() => {
    if (!nextStop) return null;
    const planned = new Date(nextStop.plannedAt).getTime();
    const arrival = eta ? eta.arrivalAt.getTime() : nowMs;
    // Without a fix the only honest statement is "we are already past the plan".
    if (!eta && arrival < planned) return null;
    return Math.round((arrival - planned) / 60_000);
  }, [eta, nextStop, nowMs]);

  const onboard = useMemo(() => {
    const before = stops
      .filter((s) => s.departed)
      .reduce((sum, s) => sum + s.boarded - s.alighted, 0);
    return Math.max(0, before + boarded - alighted);
  }, [stops, boarded, alighted]);

  const lines = useMemo<MapLine[]>(() => {
    const all = points.map((p) => [p.lat, p.lng] as [number, number]);
    let split: { passed: [number, number][]; ahead: [number, number][] } | null = null;
    if (onRoute && projection && fix) {
      const here: [number, number] = [fix.lat, fix.lng];
      const i = projection.segmentIndex;
      split = { passed: [...all.slice(0, i + 1), here], ahead: [here, ...all.slice(i + 1)] };
    } else if (prepared) {
      const lastArrived = [...stops].reverse().find((s) => s.arrived);
      const at = lastArrived ? prepared.stops.find((p) => p.stopId === lastArrived.stopId)?.pointIndex : undefined;
      if (at !== undefined) split = { passed: all.slice(0, at + 1), ahead: all.slice(at) };
    }
    if (!split) return [{ id: "route", color: routeColor, points: all }];
    return [
      { id: "ahead", color: routeColor, points: split.ahead },
      { id: "passed", color: PASSED_COLOR, points: split.passed },
    ];
  }, [points, prepared, stops, routeColor, onRoute, projection, fix]);

  const mapStops = useMemo<MapStop[]>(
    () =>
      stops.map((s, i) => ({
        id: s.stopId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        order: i + 1,
        color: routeColor,
        muted: s.arrived,
        highlight: s.stopId === nextStop?.stopId,
        note: `по плану ${s.plannedLabel}`,
      })),
    [stops, routeColor, nextStop?.stopId],
  );

  /** Runs an action once, then holds the button for a second. */
  const act = (fn: () => Promise<void>) => {
    if (locked || pending) return;
    setLocked(true);
    setTimeout(() => setLocked(false), TAP_LOCK_MS);
    start(fn);
  };
  const busy = locked || pending;

  return (
    <div className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-drive-bg text-drive-fg">
      <header className="flex shrink-0 items-center gap-2.5 px-4 py-3.5">
        <Link
          href="/driver"
          aria-label="Выйти к списку рейсов"
          className="flex size-11 items-center justify-center rounded-xl bg-drive-panel text-drive-fg"
        >
          <IconArrowLeft />
        </Link>
        <RouteBadge name={routeName} color={routeColor} className="h-8 min-w-9 justify-center rounded-lg px-2 text-base font-extrabold" />
        <span className="flex-1 text-base font-semibold">Рейс {startTime}</span>
        {atStop ? (
          <span className="rounded-full bg-drive-late px-2.5 py-1.5 text-[13px] font-bold text-drive-late-fg">
            На остановке
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-drive-panel px-2.5 py-1.5 text-[13px] font-semibold text-drive-muted">
            <span
              className={cx(
                "size-2 rounded-full",
                gps === "sending" ? "bg-drive-live" : gps === "starting" ? "bg-drive-muted" : "bg-drive-late-fg",
              )}
            />
            GPS
          </span>
        )}
      </header>

      <PositionTracker tripId={tripId} active banner={false} onFix={onFix} onStatus={setGps} />

      {atStop ? (
        <AtStopBody
          stop={atStop}
          position={position}
          total={stops.length}
          boarded={boarded}
          alighted={alighted}
          onBoarded={setBoarded}
          onAlighted={setAlighted}
          onboard={onboard}
          capacity={capacity}
          busy={busy}
        />
      ) : (
        <main className="flex flex-1 flex-col gap-3.5 px-4 pt-1.5 pb-4">
          {offRoute ? (
            <p className="flex items-center gap-2 rounded-xl bg-drive-late px-3 py-2.5 text-sm font-semibold text-drive-late-fg">
              <IconAlert className="size-4 shrink-0" />
              Вы отклонились от маршрута на {formatDistance(offRouteM ?? 0)}
            </p>
          ) : null}

          {nextStop ? (
            <section aria-label="Следующая остановка" className="flex flex-col gap-3.5 rounded-[22px] bg-drive-panel p-5">
              <p className="text-sm font-semibold text-drive-muted">
                Следующая остановка · {position} из {stops.length}
              </p>
              <h1 className="text-[36px] leading-[1.05] font-extrabold tracking-[-0.02em]">{nextStop.name}</h1>
              {/* The estimate and the delay stay on one line: wrapping would push
                  the buttons below the fold on a small phone. */}
              <div className="flex items-end justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  {/* A number is the loudest thing here; a word in its place would
                      out-shout the stop name, so it stays a size smaller. */}
                  {drivenPast || minutesToNext === 0 ? (
                    <span className="text-[28px] leading-none font-extrabold">
                      {drivenPast ? "рядом" : "сейчас"}
                    </span>
                  ) : (
                    <span className="text-[44px] leading-none font-extrabold tabular-nums">
                      {minutesToNext === null ? "—" : `${minutesToNext} мин`}
                    </span>
                  )}
                  <span className="text-base text-drive-muted">
                    {toNextM !== null && !drivenPast ? `${formatDistance(Math.max(0, toNextM))} · ` : ""}
                    план {nextStop.plannedLabel}
                    {eta ? "" : " · без GPS"}
                  </span>
                </div>
                {delayPill(delayMin) ? (
                  <span className="shrink-0 rounded-lg bg-drive-late px-2.5 py-1 text-sm font-bold whitespace-nowrap text-drive-late-fg">
                    {delayPill(delayMin)}
                  </span>
                ) : null}
              </div>

              {nextStop.waiting > 0 ? (
                <button
                  type="button"
                  aria-expanded={showWaiting}
                  onClick={() => setShowWaiting((v) => !v)}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-drive-raised px-3.5 text-left"
                >
                  <IconUsers className="size-6 shrink-0" />
                  <span className="flex-1 text-xl font-bold">{waitingLabel(nextStop.waiting)}</span>
                  <span className="text-sm text-drive-muted">{showWaiting ? "Скрыть" : "Список"}</span>
                </button>
              ) : null}
              {showWaiting && nextStop.waitingNames.length ? (
                <ul className="flex flex-col gap-1 rounded-2xl bg-drive-raised px-3.5 py-3 text-[15px]">
                  {nextStop.waitingNames.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : (
            <section className="flex flex-col gap-2 rounded-[22px] bg-drive-panel p-5">
              <p className="text-sm font-semibold text-drive-muted">Конечная пройдена</p>
              <h1 className="text-[32px] leading-tight font-extrabold">Все остановки отмечены</h1>
            </section>
          )}

          <div className="h-[170px] overflow-hidden rounded-[18px] bg-drive-panel">
            <MapPanel
              className="h-[170px] w-full"
              expandable={false}
              stops={mapStops}
              lines={lines}
              vehicles={fix ? [{ id: "me", lat: fix.lat, lng: fix.lng, label: "Вы", color: routeColor, alert: offRoute }] : []}
              follow={fix ? { lat: fix.lat, lng: fix.lng } : null}
            />
          </div>

          {afterNext ? (
            <div className="flex items-center gap-3 rounded-2xl bg-drive-panel px-4 py-3 text-[15px]">
              <span className="text-drive-muted">Потом</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{afterNext.name}</span>
              <span className="shrink-0 text-drive-muted tabular-nums">
                {afterNext.plannedLabel}
                {afterNext.waiting > 0 ? ` · ждут ${afterNext.waiting}` : ""}
              </span>
            </div>
          ) : null}

          <div className="flex gap-2.5">
            <SecondaryButton onClick={() => setSheet("navigator")} disabled={!nextStop}>
              Навигатор
            </SecondaryButton>
            <SecondaryButton onClick={() => setSheet("stops")}>Все остановки</SecondaryButton>
          </div>
        </main>
      )}

      <div className="sticky bottom-0 shrink-0 bg-drive-bg px-4 pt-3 pb-7">
        {atStop ? (
          <MainButton
            tone="depart"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await setHeadcount(tripId, atStop.stopId, boarded, alighted);
                await departStop(tripId, atStop.stopId);
              })
            }
          >
            Отправиться
          </MainButton>
        ) : nextStop ? (
          <MainButton tone="arrive" disabled={busy} onClick={() => act(() => markArrival(tripId, nextStop.stopId))}>
            Прибыл на остановку
          </MainButton>
        ) : (
          <MainButton tone="depart" disabled={busy} onClick={() => setSheet("finish")}>
            Завершить рейс
          </MainButton>
        )}
      </div>

      {sheet === "navigator" && nextStop ? (
        <Sheet title={`Доехать до «${nextStop.name}»`} onClose={() => setSheet(null)}>
          <p className="text-[15px] leading-snug text-drive-muted">
            Внешний навигатор прокладывает свой путь. Утверждённый маршрут — на карте выше.
          </p>
          <div className="flex flex-col gap-2.5">
            <SheetLink href={yandexMapsRoute(nextStop, "driving")}>Яндекс Карты</SheetLink>
            <SheetLink href={googleMapsRoute(nextStop, "driving")}>Google Карты</SheetLink>
          </div>
        </Sheet>
      ) : null}

      {sheet === "stops" ? (
        <Sheet title="Все остановки" onClose={() => setSheet(null)}>
          <ol className="flex max-h-[50vh] flex-col overflow-y-auto">
            {stops.map((s, i) => (
              <li
                key={s.stopId}
                className={cx(
                  "grid min-h-13 grid-cols-[24px_1fr_auto] items-center gap-x-3 border-b border-drive-line last:border-b-0",
                  s.arrived && !s.departed && "text-drive-late-fg",
                  s.departed && "text-drive-muted",
                )}
              >
                <span className="text-center text-[13px] font-bold tabular-nums">{i + 1}</span>
                <span className="truncate text-[15px] font-semibold">{s.name}</span>
                <span className="text-right text-[13px] tabular-nums">
                  {s.arrivedLabel ? `факт ${s.arrivedLabel}` : `план ${s.plannedLabel}`}
                  {s.departed ? ` · +${s.boarded}/−${s.alighted}` : s.waiting > 0 ? ` · ждут ${s.waiting}` : ""}
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => setSheet("finish")}
            className="min-h-13 cursor-pointer rounded-2xl text-[15px] font-semibold text-drive-late-fg"
          >
            Завершить рейс досрочно
          </button>
        </Sheet>
      ) : null}

      {sheet === "finish" ? (
        <FinishSheet
          stops={stops}
          delayMin={delayMin}
          busy={busy}
          onCancel={() => setSheet(null)}
          onConfirm={() => act(() => finishTrip(tripId))}
        />
      ) : null}
    </div>
  );
}

function MainButton({
  tone,
  disabled,
  onClick,
  children,
}: {
  tone: "arrive" | "depart";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex min-h-18 w-full cursor-pointer items-center justify-center rounded-[18px] text-[22px] font-extrabold transition-opacity disabled:opacity-60",
        tone === "arrive" ? "bg-drive-arrive text-drive-arrive-fg" : "bg-drive-depart text-white",
      )}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl bg-drive-panel text-[15px] font-semibold text-drive-fg disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SheetLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-14 items-center justify-center rounded-2xl bg-drive-raised text-[17px] font-bold text-drive-fg"
    >
      {children}
    </a>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-[rgba(4,8,16,.55)]" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-3xl bg-drive-panel px-4 pt-5 pb-7 text-drive-fg"
      >
        <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-sm bg-drive-line" />
        <h2 className="mx-1 text-xl font-extrabold">{title}</h2>
        {children}
        <button
          type="button"
          onClick={onClose}
          className="min-h-13 cursor-pointer rounded-2xl text-base font-semibold text-drive-fg"
        >
          Закрыть
        </button>
      </section>
    </>
  );
}

/** The last screen of a trip: what was done, and a confirmation you cannot slip into. */
function FinishSheet({
  stops,
  delayMin,
  busy,
  onCancel,
  onConfirm,
}: {
  stops: DriveStop[];
  delayMin: number | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const carried = stops.reduce((sum, s) => sum + s.boarded, 0);
  const marked = stops.filter((s) => s.arrived).length;

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-[rgba(4,8,16,.55)]" onClick={onCancel} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-title"
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4.5 rounded-t-3xl bg-drive-panel px-4 pt-6 pb-7 text-drive-fg"
      >
        <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-sm bg-drive-line" />
        <h2 id="finish-title" className="mx-1 text-[26px] font-extrabold">
          Завершить рейс?
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Tile value={String(carried)} label="перевезено" />
          <Tile value={`${marked}/${stops.length}`} label="остановок" />
          <Tile
            value={delayPill(delayMin) ?? "вовремя"}
            label="к расписанию"
            warn={delayMin !== null && delayMin >= 2}
          />
        </div>
        <p className="mx-1 text-[15px] leading-snug text-drive-muted">
          После завершения отметки нельзя будет изменить, а передача GPS выключится.
        </p>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex min-h-16 cursor-pointer items-center justify-center rounded-2xl bg-drive-depart text-xl font-extrabold text-white disabled:opacity-60"
          >
            Завершить рейс
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-13 cursor-pointer rounded-2xl text-base font-semibold text-drive-fg"
          >
            Вернуться к рейсу
          </button>
        </div>
      </section>
    </>
  );
}

function Tile({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-drive-raised p-3">
      {/* "+2 мин" fits big; "+9 ч 3 мин" has to step down a size to stay on one line. */}
      <span
        className={cx(
          "font-extrabold tabular-nums",
          value.length > 6 ? "text-lg" : "text-[28px]",
          warn && "text-drive-late-fg",
        )}
      >
        {value}
      </span>
      <span className="text-[13px] text-drive-muted">{label}</span>
    </div>
  );
}

function Counter({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <span className="text-lg font-bold">{label}</span>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          aria-label={`${label}: меньше`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="size-16 cursor-pointer rounded-2xl bg-drive-raised text-3xl font-semibold text-drive-fg disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-15 text-center text-[44px] font-extrabold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`${label}: больше`}
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          className="size-16 cursor-pointer rounded-2xl bg-drive-raised text-3xl font-semibold text-drive-fg disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function AtStopBody({
  stop,
  position,
  total,
  boarded,
  alighted,
  onBoarded,
  onAlighted,
  onboard,
  capacity,
  busy,
}: {
  stop: DriveStop;
  position: number;
  total: number;
  boarded: number;
  alighted: number;
  onBoarded: (n: number) => void;
  onAlighted: (n: number) => void;
  onboard: number;
  capacity: number | null;
  busy: boolean;
}) {
  return (
    <main className="flex flex-1 flex-col gap-3.5 px-4 pt-1.5 pb-4">
      <section className="flex flex-col gap-1.5 px-1">
        <p className="text-sm font-semibold text-drive-muted">
          Остановка {position} из {total}
          {stop.arrivedLabel ? ` · прибыли в ${stop.arrivedLabel}` : ""}
        </p>
        <h1 className="text-[36px] leading-[1.05] font-extrabold tracking-[-0.02em]">{stop.name}</h1>
      </section>

      {stop.waitingNames.length ? (
        <details className="rounded-2xl bg-drive-panel">
          <summary className="flex min-h-14 cursor-pointer items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex-1 text-[17px] font-bold">Записались {stop.waiting}</span>
            <span className="text-sm text-drive-muted">Показать</span>
          </summary>
          <ul className="flex flex-col gap-1 px-4 pb-3.5 text-[15px] text-drive-muted">
            {stop.waitingNames.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <section aria-label="Сели и вышли" className="flex flex-col gap-3 rounded-[20px] bg-drive-panel px-4 py-4.5">
        <Counter label="Сели" value={boarded} onChange={onBoarded} disabled={busy} />
        <div className="h-px bg-drive-line" />
        <Counter label="Вышли" value={alighted} onChange={onAlighted} disabled={busy} />
      </section>

      <p className="mx-1 text-[15px] text-drive-muted">
        В салоне станет{" "}
        <strong className="font-bold text-drive-fg">
          {onboard}
          {capacity ? ` из ${capacity}` : ""}
        </strong>
      </p>
    </main>
  );
}

/** Keeps the screen on while driving; the browser drops the lock when the tab is hidden. */
function useWakeLock() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        // Denied (battery saver, unsupported context): the screen just may dim.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
}
