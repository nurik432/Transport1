"use client";

import { useEffect, useState } from "react";
import { MapPanel, type MapLine, type MapStop } from "./map";
import { cx } from "./ui";

export interface LiveState {
  position: { lat: number; lng: number; recordedAt: string; speedKph: number | null; offRouteM: number | null } | null;
  tracking: "live" | "stale" | "lost" | "none";
  etaByStop: Record<string, { minutesFromNow: number; distanceM: number; passed: boolean; arrivalAt: string }>;
  trail?: { lat: number; lng: number }[];
}

const EMPTY: LiveState = { position: null, tracking: "none", etaByStop: {} };

/** Polls one trip's live state. Stops polling when the trip is not running. */
export function useTripLive(tripId: string, active: boolean, seconds = 15): LiveState {
  const [state, setState] = useState<LiveState>(EMPTY);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const load = async (force = false) => {
      // Skip background ticks to save battery, but always load once on mount
      // and again as soon as the tab is brought back to the front.
      if (!force && document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/v1/trips/${tripId}/live`, { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as LiveState & { ok: boolean };
        if (!cancelled && json.ok) setState({ position: json.position, tracking: json.tracking, etaByStop: json.etaByStop, trail: json.trail });
      } catch {
        // keep the previous state; the next tick may succeed
      }
    };

    void load(true);
    const id = setInterval(() => void load(), seconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tripId, active, seconds]);

  return state;
}

export function LiveBadge({ tracking }: { tracking: LiveState["tracking"] }) {
  if (tracking === "none" || tracking === "lost") return null;
  const live = tracking === "live";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium",
        live ? "bg-ok-soft text-green-800" : "bg-warn-soft text-yellow-800",
      )}
    >
      <span className={cx("size-1.5 rounded-full", live ? "bg-ok" : "bg-warn")} aria-hidden="true" />
      {live ? "Транспорт на карте" : "Данные обновлялись давно"}
    </span>
  );
}

/** Route map that also shows where the vehicle is right now. */
export function LiveTripMap({
  tripId,
  active,
  stops,
  line,
  routeName,
  routeColor,
  className,
  onState,
}: {
  tripId: string;
  active: boolean;
  stops: MapStop[];
  line: MapLine;
  routeName: string;
  routeColor: string;
  className?: string;
  onState?: (s: LiveState) => void;
}) {
  const live = useTripLive(tripId, active);

  useEffect(() => {
    onState?.(live);
  }, [live, onState]);

  const speed = live.position?.speedKph;
  return (
    <MapPanel
      className={className}
      stops={stops}
      lines={[line]}
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
                alert: (live.position.offRouteM ?? 0) > 300,
                note:
                  speed != null && speed > 0
                    ? `${Math.round(speed)} км/ч · ${new Date(live.position.recordedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                    : `Обновлено ${new Date(live.position.recordedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`,
              },
            ]
          : []
      }
    />
  );
}
