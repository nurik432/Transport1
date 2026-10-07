"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { IconPin } from "@/components/icons";

const PREF_KEY = "transport:share-location";
const SEND_EVERY_MS = 15_000;

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch {
    // private mode: the choice lasts until the page closes
  }
}

/**
 * "Show the driver where I am". Off by default; the choice is remembered on the
 * device. Positions go out only while this trip is running and stop as soon as
 * the switch is turned off or the trip ends (the server refuses them then).
 */
export function ShareLocation({
  tripId,
  onPosition,
}: {
  tripId: string;
  /** must be stable (a state setter): a new function restarts the GPS watch */
  onPosition: (p: { lat: number; lng: number } | null) => void;
}) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string>();
  const lastSent = useRef(0);

  useEffect(() => {
    // localStorage is read after hydration so the server and first client render agree
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (readPref()) setOn(true);
  }, []);

  useEffect(() => {
    if (!on) return;
    if (!navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Телефон не даёт определить местоположение");
      return;
    }
    let stopped = false;
    lastSent.current = 0;

    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onPosition(point);
        setError(undefined);
        if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = Date.now();
        try {
          const res = await fetch(`/api/v1/trips/${tripId}/my-position`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...point, accuracyM: pos.coords.accuracy ?? null }),
          });
          if (!stopped && res.status === 409) {
            const json = await res.json().catch(() => null);
            setError(json?.error ?? "Рейс не в пути");
          }
        } catch {
          // no signal: the next fix tries again
        }
      },
      () => setError("Нет доступа к геолокации — разрешите её в настройках браузера"),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watch);
      onPosition(null);
      void fetch(`/api/v1/trips/${tripId}/my-position`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [on, tripId, onPosition]);

  function toggle() {
    const next = !on;
    setOn(next);
    writePref(next);
    setError(undefined);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-card px-3.5 py-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 text-left"
      >
        <IconPin className={cx("size-5 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold">Показать водителю, где я</span>
          <span className="text-sm text-muted-foreground">
            {on ? "Водитель видит вас на карте, пока рейс в пути" : "Только на время этого рейса, выключается в любой момент"}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted")}
        >
          <span
            className={cx(
              "absolute top-1 size-5 rounded-full bg-white shadow-sm transition-all",
              on ? "left-6" : "left-1",
            )}
          />
        </span>
      </button>
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
