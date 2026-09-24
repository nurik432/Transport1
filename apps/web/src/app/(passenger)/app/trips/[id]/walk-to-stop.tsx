"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { distanceMeters, formatDistance } from "@transport/domain";
import { MapPanel, type MapStop } from "@/components/map";
import { Button, Card, LinkButton } from "@/components/ui";
import { IconAlert, IconNavigation } from "@/components/icons";
import { googleMapsRoute, yandexMapsRoute } from "@/lib/nav-links";
import { bookTrip } from "../../actions";

interface Point {
  lat: number;
  lng: number;
}

export interface WalkStop extends Point {
  id: string;
  name: string;
}

interface Walk {
  stopId: string;
  points: [number, number][];
  distanceM: number;
  durationMin: number;
  source: "road" | "straight";
}

type State =
  | { kind: "idle" }
  | { kind: "busy"; step: "locating" | "routing" }
  | { kind: "ready"; walk: Walk }
  | { kind: "error"; message: string };

/** Closer than this the passenger is at the stop. */
const AT_STOP_M = 30;
const WALK_COLOR = "#2563eb";

/** Current position: precise first, then network location (laptops, indoors). */
function locate(): Promise<Point> {
  const once = (options: PositionOptions) =>
    new Promise<Point>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        reject,
        options,
      ),
    );
  return once({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }).catch((err: GeolocationPositionError) =>
    err.code === err.PERMISSION_DENIED
      ? Promise.reject(err)
      : once({ enableHighAccuracy: false, timeout: 20_000, maximumAge: 120_000 }),
  );
}

async function fetchWalk(stopId: string, from: Point): Promise<Walk> {
  const response = await fetch("/api/v1/routing/walk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stopId, lat: from.lat, lng: from.lng }),
  }).catch(() => null);
  if (!response) throw new Error("Нет связи с сервером");
  const body = (await response.json().catch(() => null)) as (Omit<Walk, "stopId"> & { ok: boolean; error?: string }) | null;
  if (!response.ok || !body?.ok) throw new Error(body?.error ?? "Не удалось построить маршрут");
  return { stopId, points: body.points, distanceM: body.distanceM, durationMin: body.durationMin, source: body.source };
}

/**
 * Walking directions to a stop of this trip. The boarding stop is the default;
 * without a booking it is the nearest one. Any stop can be picked from the list
 * or on the map, and the passenger can board from it.
 * Location is asked for only when the button is pressed and is not stored.
 */
export function WalkToStop({
  tripId,
  stops,
  bookedStopId,
  canBook,
}: {
  tripId: string;
  stops: WalkStop[];
  bookedStopId: string | null;
  /** the trip still takes bookings */
  canBook: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [me, setMe] = useState<Point | null>(null);
  const [booking, startBooking] = useTransition();
  // Re-routing to another stop keeps the current map on screen.
  const [rerouting, setRerouting] = useState(false);
  const [rerouteError, setRerouteError] = useState<string | null>(null);
  // Where directions start: the position at the moment of asking, not the moving dot,
  // so switching stops doesn't send a new position on every step.
  const origin = useRef<Point | null>(null);

  const open = state.kind === "ready";
  useEffect(() => {
    if (!open || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [open]);

  const byDistance = useMemo(() => {
    const from = me;
    return stops
      .map((s) => ({ ...s, distanceM: from ? distanceMeters(from, s) : null }))
      .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  }, [stops, me]);

  const route = async (stopId: string) => {
    const from = origin.current;
    if (!from) return;
    const shown = state.kind === "ready";
    if (shown) setRerouting(true);
    else setState({ kind: "busy", step: "routing" });
    setRerouteError(null);
    try {
      setState({ kind: "ready", walk: await fetchWalk(stopId, from) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось построить маршрут";
      if (shown) setRerouteError(message);
      else setState({ kind: "error", message });
    } finally {
      setRerouting(false);
    }
  };

  const start = async () => {
    if (!navigator.geolocation) {
      setState({ kind: "error", message: "Браузер не умеет определять местоположение" });
      return;
    }
    setState({ kind: "busy", step: "locating" });
    try {
      origin.current = await locate();
    } catch (err) {
      const denied = (err as GeolocationPositionError)?.code === 1;
      setState({
        kind: "error",
        message: denied
          ? "Доступ к местоположению запрещён. Разрешите его в настройках браузера для этого сайта."
          : "Не удаётся определить местоположение. Проверьте, что геолокация включена на устройстве.",
      });
      return;
    }
    setMe(origin.current);
    const from = origin.current;
    const nearest = [...stops].sort((a, b) => distanceMeters(from, a) - distanceMeters(from, b))[0];
    const target = bookedStopId ?? nearest?.id;
    if (target) await route(target);
  };

  const selectedId = state.kind === "ready" ? state.walk.stopId : null;
  const selected = stops.find((s) => s.id === selectedId) ?? stops.find((s) => s.id === bookedStopId) ?? null;

  const externalLinks = (to: Point) => (
    <div className="flex gap-2">
      <LinkButton external href={yandexMapsRoute(to, "walking")} className="flex-1">
        Яндекс Карты
      </LinkButton>
      <LinkButton external href={googleMapsRoute(to, "walking")} className="flex-1">
        Google Карты
      </LinkButton>
    </div>
  );

  if (state.kind !== "ready") {
    const busy = state.kind === "busy";
    return (
      <Card className="flex flex-col gap-3">
        <Button variant="secondary" onClick={start} disabled={busy} className="w-full">
          <IconNavigation className="size-4" />
          {busy
            ? state.step === "locating"
              ? "Определяем, где вы…"
              : "Строим маршрут…"
            : "Как дойти до остановки"}
        </Button>
        {state.kind === "error" ? (
          <>
            <p className="flex items-start gap-2 text-xs text-red-800">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {state.message}
            </p>
            {selected ? externalLinks(selected) : null}
          </>
        ) : null}
      </Card>
    );
  }

  const { walk } = state;
  const target = stops.find((s) => s.id === walk.stopId)!;
  const leftM = me ? distanceMeters(me, target) : null;

  const mapStops: MapStop[] = stops.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    highlight: s.id === walk.stopId,
    muted: s.id !== walk.stopId,
    note: s.id === walk.stopId ? "Идём сюда" : "Нажмите, чтобы идти сюда",
  }));

  return (
    <Card className="flex flex-col gap-3 p-0">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Идти до остановки</span>
          <select
            value={walk.stopId}
            disabled={rerouting}
            onChange={(e) => void route(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium"
          >
            {byDistance.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.distanceM !== null ? ` — ${formatDistance(s.distanceM)}` : ""}
                {s.id === bookedStopId ? " · ваша посадка" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" className="mt-5 min-h-11 shrink-0 px-2" onClick={() => setState({ kind: "idle" })}>
          Скрыть
        </Button>
      </div>

      <p className="px-4 text-xs text-muted-foreground tabular-nums">
        {formatDistance(walk.distanceM)} · ~{walk.durationMin} мин пешком
        {walk.source === "straight" ? " · по прямой, путь по улицам недоступен" : ""}
        {rerouting ? " · строим новый маршрут…" : ""}
      </p>
      {rerouteError ? (
        <p className="flex items-start gap-2 px-4 text-xs text-red-800">
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          {rerouteError}
        </p>
      ) : null}

      <MapPanel
        stops={mapStops}
        lines={[{ id: "walk", color: WALK_COLOR, points: walk.points, dashed: true }]}
        me={me}
        fitKey={walk.stopId}
        fitPoints={walk.points}
        onStopClick={(stopId) => {
          if (stopId !== walk.stopId) void route(stopId);
        }}
        className="h-72 w-full"
      />

      <div className="flex flex-col gap-2 px-4 pb-4">
        {leftM !== null ? (
          <p className="text-sm font-medium">
            {leftM <= AT_STOP_M ? "Вы на остановке" : `Осталось ~${formatDistance(leftM)} по прямой`}
          </p>
        ) : null}
        {canBook && walk.stopId !== bookedStopId ? (
          <Button disabled={booking} onClick={() => startBooking(() => bookTrip(tripId, walk.stopId))}>
            {bookedStopId ? `Садиться на «${target.name}»` : `Поеду с «${target.name}»`}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">Голосовые подсказки — во внешнем приложении:</p>
        {externalLinks(target)}
      </div>
    </Card>
  );
}
