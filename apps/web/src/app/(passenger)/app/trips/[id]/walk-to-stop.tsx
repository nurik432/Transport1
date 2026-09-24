"use client";

import { useEffect, useState } from "react";
import { distanceMeters, formatDistance } from "@transport/domain";
import { MapPanel } from "@/components/map";
import { Button, Card, LinkButton } from "@/components/ui";
import { IconAlert, IconNavigation } from "@/components/icons";
import { googleMapsRoute, yandexMapsRoute } from "@/lib/nav-links";

interface Point {
  lat: number;
  lng: number;
}

interface Walk {
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

/**
 * Walking directions from the passenger to their boarding stop.
 * Location is asked for only when the button is pressed and used for this
 * request only; nothing is stored.
 */
export function WalkToStop({ stop }: { stop: Point & { id: string; name: string } }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [me, setMe] = useState<Point | null>(null);

  // While directions are open, keep the "me" dot moving.
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

  const start = async () => {
    if (!navigator.geolocation) {
      setState({ kind: "error", message: "Браузер не умеет определять местоположение" });
      return;
    }
    setState({ kind: "busy", step: "locating" });
    let from: Point;
    try {
      from = await locate();
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
    setMe(from);
    setState({ kind: "busy", step: "routing" });

    try {
      const response = await fetch("/api/v1/routing/walk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stopId: stop.id, lat: from.lat, lng: from.lng }),
      });
      const body = (await response.json().catch(() => null)) as (Walk & { ok: boolean; error?: string }) | null;
      if (!response.ok || !body?.ok) {
        setState({ kind: "error", message: body?.error ?? "Не удалось построить маршрут" });
        return;
      }
      setState({
        kind: "ready",
        walk: { points: body.points, distanceM: body.distanceM, durationMin: body.durationMin, source: body.source },
      });
    } catch {
      setState({ kind: "error", message: "Нет связи с сервером" });
    }
  };

  const externalLinks = (
    <div className="flex gap-2">
      <LinkButton external href={yandexMapsRoute(stop, "walking")} className="flex-1">
        Яндекс Карты
      </LinkButton>
      <LinkButton external href={googleMapsRoute(stop, "walking")} className="flex-1">
        Google Карты
      </LinkButton>
    </div>
  );

  if (state.kind !== "ready") {
    return (
      <Card className="flex flex-col gap-3">
        <Button variant="secondary" onClick={start} disabled={state.kind === "busy"} className="w-full">
          <IconNavigation className="size-4" />
          {state.kind === "busy"
            ? state.step === "locating"
              ? "Определяем, где вы…"
              : "Строим маршрут…"
            : `Как дойти до «${stop.name}»`}
        </Button>
        {state.kind === "error" ? (
          <>
            <p className="flex items-start gap-2 text-xs text-red-800">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {state.message}
            </p>
            {externalLinks}
          </>
        ) : null}
      </Card>
    );
  }

  const { walk } = state;
  const leftM = me ? distanceMeters(me, stop) : null;

  return (
    <Card className="flex flex-col gap-3 p-0">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">До остановки «{stop.name}»</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatDistance(walk.distanceM)} · ~{walk.durationMin} мин пешком
            {walk.source === "straight" ? " · по прямой, путь по улицам недоступен" : ""}
          </p>
        </div>
        <Button variant="ghost" className="min-h-9 shrink-0 px-2" onClick={() => setState({ kind: "idle" })}>
          Скрыть
        </Button>
      </div>

      <MapPanel
        stops={[{ id: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng, highlight: true, note: "Остановка посадки" }]}
        lines={[{ id: "walk", color: WALK_COLOR, points: walk.points, dashed: true }]}
        me={me}
        className="h-72 w-full"
      />

      <div className="flex flex-col gap-2 px-4 pb-4">
        {leftM !== null ? (
          <p className="text-sm font-medium">
            {leftM <= AT_STOP_M ? "Вы на остановке" : `Осталось ~${formatDistance(leftM)} по прямой`}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">Голосовые подсказки — во внешнем приложении:</p>
        {externalLinks}
      </div>
    </Card>
  );
}
