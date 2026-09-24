"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import { IconAlert, IconPin } from "@/components/icons";

/**
 * starting   — waiting for the first fix
 * sending    — the last sample reached the server
 * denied     — the driver (or the OS) refused location access
 * no_fix     — the device can't determine its position (no GPS, OS location off, timeout)
 * send_error — a fix was obtained but the server or network rejected it
 */
type Status = "starting" | "sending" | "denied" | "no_fix" | "send_error";

const SEND_EVERY_MS = 15_000;

const PRECISE: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 };
// Wi-Fi / network location: works on laptops and indoors where GPS never gets a fix.
const APPROXIMATE: PositionOptions = { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 };

/**
 * Streams the driver's position while the trip is in progress.
 * Tracking starts when the trip starts and stops as soon as it ends, so the
 * driver is never tracked outside a working trip.
 */
export function PositionTracker({
  tripId,
  active,
  onFix,
}: {
  tripId: string;
  active: boolean;
  /** every fix, before throttling: the trip map follows the device with it */
  onFix?: (pos: GeolocationPosition) => void;
}) {
  const router = useRouter();
  // Latest callback without restarting the watch when the parent re-renders.
  const onFixRef = useRef(onFix);
  useEffect(() => {
    onFixRef.current = onFix;
  });
  const [status, setStatus] = useState<Status>("starting");
  const [approximate, setApproximate] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!active || typeof navigator === "undefined") return;
    if (!navigator.geolocation) {
      queueMicrotask(() => setStatus("no_fix"));
      return;
    }
    let cancelled = false;
    let watchId: number | null = null;
    let precise = true;
    let gotFix = false;
    // Per watch, not a ref: a re-run effect must not inherit the previous throttle,
    // or its first fix is dropped and the screen stays on "Определяем…".
    let lastSent = 0;

    const send = async (pos: GeolocationPosition) => {
      gotFix = true;
      onFixRef.current?.(pos);
      const now = Date.now();
      if (now - lastSent < SEND_EVERY_MS) return;
      lastSent = now;

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
          setSendError(null);
          setSentAt(new Date());
          // Refresh the screen occasionally so waiting counts stay current.
          if (now - lastRefresh.current > 60_000) {
            lastRefresh.current = now;
            router.refresh();
          }
        } else {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          if (cancelled) return;
          setStatus("send_error");
          setSendError(body?.error ?? `ошибка сервера ${response.status}`);
        }
      } catch {
        if (cancelled) return;
        setStatus("send_error");
        setSendError("нет связи с сервером");
      }
    };

    const onError = (err: GeolocationPositionError) => {
      if (cancelled) return;
      if (err.code === err.PERMISSION_DENIED) {
        setStatus("denied");
        return;
      }
      // Precise mode never produced a fix: fall back to network location once.
      // After a fix, a timeout is a transient gap (tunnel, building) — keep watching.
      if (precise && !gotFix) {
        precise = false;
        setApproximate(true);
        start();
        return;
      }
      setStatus("no_fix");
    };

    const start = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition((pos) => void send(pos), onError, precise ? PRECISE : APPROXIMATE);
    };

    start();

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [active, tripId, router]);

  if (!active) return null;

  const failed = status === "denied" || status === "no_fix" || status === "send_error";
  const tone = failed
    ? "bg-danger-soft text-red-800"
    : status === "sending"
      ? "bg-ok-soft text-green-800"
      : "bg-muted text-muted-foreground";

  const time = sentAt ? ` · ${sentAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "";
  const label =
    status === "denied"
      ? "Геолокация запрещена — пассажиры не видят транспорт на карте"
      : status === "no_fix"
        ? "Не удаётся определить местоположение"
        : status === "send_error"
          ? `Не удаётся отправить координаты: ${sendError}`
          : status === "sending"
            ? `Координаты передаются${approximate ? " (приблизительно)" : ""}${time}`
            : "Определяем местоположение…";

  const hint =
    status === "denied"
      ? "Разрешите доступ к местоположению в настройках браузера для этого сайта и обновите страницу."
      : status === "no_fix"
        ? "Проверьте, что геолокация включена на устройстве (на компьютере — в параметрах конфиденциальности Windows) и разрешена браузеру."
        : null;

  return (
    <div className={cx("rounded-lg px-3 py-2 text-xs", tone)}>
      <p className="flex items-center gap-2 font-medium">
        {failed ? <IconAlert className="size-4 shrink-0" /> : <IconPin className="size-4 shrink-0" />}
        {label}
      </p>
      {hint && <p className="mt-1 pl-6">{hint}</p>}
    </div>
  );
}
