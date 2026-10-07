"use client";

import { useEffect, useState } from "react";

export interface PassengerPoint {
  passengerId: string;
  name: string;
  stopName: string;
  lat: number;
  lng: number;
  recordedAt: string;
}

/** Positions of passengers who chose to share them, polled every 15 s while the tab is visible. */
export function usePassengersLive(tripId: string, seconds = 15): PassengerPoint[] {
  const [points, setPoints] = useState<PassengerPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async (force = false) => {
      if (!force && document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/v1/trips/${tripId}/passengers`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { ok: boolean; passengers?: PassengerPoint[] };
        if (!cancelled && json.ok) setPoints(json.passengers ?? []);
      } catch {
        // keep the last known points; the next tick may succeed
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
  }, [tripId, seconds]);

  return points;
}
