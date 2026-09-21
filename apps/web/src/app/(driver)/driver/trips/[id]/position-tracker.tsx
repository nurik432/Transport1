"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import { IconAlert, IconPin } from "@/components/icons";

type Status = "starting" | "sending" | "denied" | "error";

const SEND_EVERY_MS = 15_000;

/**
 * Streams the driver's position while the trip is in progress.
 * Tracking starts when the trip starts and stops as soon as it ends, so the
 * driver is never tracked outside a working trip.
 */
export function PositionTracker({ tripId, active }: { tripId: string; active: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("starting");
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const lastSent = useRef(0);
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;

    const send = async (pos: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastSent.current < SEND_EVERY_MS) return;
      lastSent.current = now;

      try {
        const response = await fetch("/api/v1/positions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            tripId,
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            speedKph:
              pos.coords.speed != null && pos.coords.speed >= 0 ? Number((pos.coords.speed * 3.6).toFixed(1)) : null,
            headingDeg:
              pos.coords.heading != null && !Number.isNaN(pos.coords.heading) ? Math.round(pos.coords.heading) : null,
            accuracyM: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
            recordedAt: new Date(pos.timestamp).toISOString(),
          }),
        });
        if (cancelled) return;

        if (response.ok) {
          setStatus("sending");
          setSentAt(new Date());
          // Refresh the screen occasionally so waiting counts stay current.
          if (now - lastRefresh.current > 60_000) {
            lastRefresh.current = now;
            router.refresh();
          }
        } else {
          setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => void send(pos),
      (err) => {
        if (cancelled) return;
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [active, tripId, router]);

  if (!active) return null;

  const tone =
    status === "denied" || status === "error"
      ? "bg-danger-soft text-red-800"
      : status === "sending"
        ? "bg-ok-soft text-green-800"
        : "bg-muted text-muted-foreground";

  const label =
    status === "denied"
      ? "Геолокация запрещена — пассажиры не видят транспорт на карте"
      : status === "error"
        ? "Не удаётся отправить координаты"
        : status === "sending"
          ? `Координаты передаются${sentAt ? ` · ${sentAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}`
          : "Определяем местоположение…";

  return (
    <p className={cx("flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium", tone)}>
      {status === "denied" || status === "error" ? <IconAlert className="size-4" /> : <IconPin className="size-4" />}
      {label}
    </p>
  );
}
