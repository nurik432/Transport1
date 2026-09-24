"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistance, preparePath, projectOnPath, type LatLng } from "@transport/domain";
import { MapPanel, type MapLine, type MapStop } from "@/components/map";
import { Button, Card, LinkButton } from "@/components/ui";
import { IconAlert, IconExpand, IconLocate, IconNavigation } from "@/components/icons";
import { googleMapsRoute, yandexMapsRoute } from "@/lib/nav-links";
import { PositionTracker } from "./position-tracker";

export interface NavStop {
  stopId: string;
  name: string;
  seq: number;
  offsetMin: number;
  lat: number;
  lng: number;
  roadDistanceM: number | null;
  plannedLabel: string;
  /** the vehicle has reached this stop */
  arrived: boolean;
}

interface Fix extends LatLng {
  accuracyM: number;
}

const PASSED_COLOR = "#94a3b8";
/** GPS noise around a stop: beyond this the stop counts as driven past */
const STOP_PASSED_M = 50;

/**
 * The driver's trip map: the approved path of this trip's route version,
 * what is already driven, the next stop and the vehicle itself.
 * Position comes from the same watch that reports it to the server.
 */
export function TripNavigation({
  tripId,
  active,
  color,
  path,
  stops,
  offRouteThresholdM,
}: {
  tripId: string;
  /** trip is in progress: track, follow and keep the screen on */
  active: boolean;
  color: string;
  /** stored road geometry of the trip's route version; straight lines when absent */
  path: [number, number][] | null;
  stops: NavStop[];
  offRouteThresholdM: number;
}) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [following, setFollowing] = useState(true);
  const [fitKey, setFitKey] = useState(0);

  useWakeLock(active);

  const onFix = useCallback((pos: GeolocationPosition) => {
    setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? Infinity });
  }, []);

  const points = useMemo<LatLng[]>(
    () => (path && path.length >= 2 ? path.map(([lat, lng]) => ({ lat, lng })) : stops.map(({ lat, lng }) => ({ lat, lng }))),
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
  // A coarse (network) fix can't tell a detour from its own error margin.
  const offRoute = offRouteM !== null && offRouteM > offRouteThresholdM && (fix?.accuracyM ?? Infinity) <= offRouteThresholdM;

  const nextStop = stops.find((s) => !s.arrived) ?? null;
  const nextOnPath = nextStop && prepared ? prepared.stops.find((p) => p.stopId === nextStop.stopId) : undefined;
  // Negative when the vehicle has driven past a stop the driver hasn't marked yet.
  const toNextM = onRoute && projection && nextOnPath ? nextOnPath.distanceM - projection.alongM : null;
  const toNextLabel =
    toNextM === null ? "" : toNextM < -STOP_PASSED_M ? " · позади, отметьте прибытие" : ` · ${formatDistance(Math.max(0, toNextM))}`;

  const lines = useMemo<MapLine[]>(() => {
    const all = points.map((p) => [p.lat, p.lng] as [number, number]);
    let split: { passed: [number, number][]; ahead: [number, number][] } | null = null;

    if (onRoute && projection && fix) {
      // Cut the line where the vehicle is.
      const here: [number, number] = [fix.lat, fix.lng];
      const i = projection.segmentIndex;
      split = { passed: [...all.slice(0, i + 1), here], ahead: [here, ...all.slice(i + 1)] };
    } else if (prepared) {
      // No usable position: cut at the last stop the driver marked.
      const lastArrived = [...stops].reverse().find((s) => s.arrived);
      const at = lastArrived ? prepared.stops.find((p) => p.stopId === lastArrived.stopId)?.pointIndex : undefined;
      if (at !== undefined) split = { passed: all.slice(0, at + 1), ahead: all.slice(at) };
    }

    if (!split) return [{ id: "route", color, points: all }];
    return [
      { id: "ahead", color, points: split.ahead },
      { id: "passed", color: PASSED_COLOR, points: split.passed },
    ];
  }, [points, prepared, stops, color, onRoute, projection, fix]);

  const mapStops = useMemo<MapStop[]>(
    () =>
      stops.map((s, i) => ({
        id: s.stopId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        order: i + 1,
        color,
        muted: s.arrived,
        highlight: s.stopId === nextStop?.stopId,
        note: `по плану ${s.plannedLabel}`,
      })),
    [stops, color, nextStop?.stopId],
  );

  const follow = active && following && fix ? { lat: fix.lat, lng: fix.lng } : null;

  return (
    <div className="flex flex-col gap-3">
      <PositionTracker tripId={tripId} active={active} onFix={onFix} />

      {active && offRoute ? (
        <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-red-800">
          <IconAlert className="size-4 shrink-0" />
          Вы отклонились от маршрута на {formatDistance(offRouteM ?? 0)}
        </p>
      ) : null}

      <Card className="overflow-hidden p-0">
        <MapPanel
          stops={mapStops}
          lines={lines}
          vehicles={fix ? [{ id: "me", lat: fix.lat, lng: fix.lng, label: "Вы", color, alert: offRoute }] : []}
          follow={follow}
          onUserMove={() => setFollowing(false)}
          fitKey={fitKey}
          className="h-80 w-full"
        />
        {active ? (
          <div className="flex gap-2 border-t border-border p-2">
            {following && fix ? (
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setFollowing(false);
                  setFitKey((k) => k + 1);
                }}
              >
                <IconExpand className="size-4" />
                Весь маршрут
              </Button>
            ) : (
              <Button variant="ghost" className="flex-1" onClick={() => setFollowing(true)} disabled={!fix}>
                <IconLocate className="size-4" />
                Следовать за мной
              </Button>
            )}
          </div>
        ) : null}
      </Card>

      {active && nextStop ? (
        <Card className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm">
            <IconNavigation className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              До «{nextStop.name}»{toNextLabel}
            </span>
          </p>
          <div className="flex gap-2">
            <LinkButton external href={yandexMapsRoute(nextStop, "driving")} className="flex-1">
              Яндекс Карты
            </LinkButton>
            <LinkButton external href={googleMapsRoute(nextStop, "driving")} className="flex-1">
              Google Карты
            </LinkButton>
          </div>
          <p className="text-xs text-muted-foreground">
            Внешний навигатор прокладывает свой путь. Утверждённый маршрут — на карте выше.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

/** Keeps the screen on while driving; the browser drops the lock when the tab is hidden. */
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
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
  }, [enabled]);
}
