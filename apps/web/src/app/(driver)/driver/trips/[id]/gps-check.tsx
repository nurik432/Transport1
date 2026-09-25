"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { IconAlert, IconCheck } from "@/components/icons";

type Probe = "checking" | "ok" | "denied" | "no_fix";

const COPY: Record<Probe, { title: string; hint: string }> = {
  checking: { title: "Проверяем GPS…", hint: "Это занимает пару секунд" },
  ok: { title: "GPS работает", hint: "Пассажиры увидят автобус на карте" },
  denied: {
    title: "Геолокация запрещена",
    hint: "Разрешите доступ к местоположению для этого сайта, иначе пассажиры не увидят автобус",
  },
  no_fix: {
    title: "Не удаётся определить местоположение",
    hint: "Проверьте, включена ли геолокация на устройстве",
  },
};

/**
 * A one-off location probe before the trip starts: better to find out about a
 * denied permission in the yard than at the first stop. Nothing is recorded —
 * coordinates are only stored while the trip is in progress.
 */
export function GpsCheck() {
  const [probe, setProbe] = useState<Probe>("checking");

  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // Out of the effect body: a synchronous setState here would cascade.
      queueMicrotask(() => {
        if (!cancelled) setProbe("no_fix");
      });
      return () => {
        cancelled = true;
      };
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        if (!cancelled) setProbe("ok");
      },
      (err) => {
        if (cancelled) return;
        setProbe(err.code === err.PERMISSION_DENIED ? "denied" : "no_fix");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const failed = probe === "denied" || probe === "no_fix";
  const copy = COPY[probe];

  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-divider px-3.5 last:border-b-0">
      <span
        className={cx(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          probe === "ok" ? "bg-ok-soft text-ok" : failed ? "bg-warn-soft text-warn-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {failed ? <IconAlert className="size-4.5" /> : <IconCheck className="size-4.5" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">{copy.title}</span>
        <span className="text-[13px] text-muted-foreground">{copy.hint}</span>
      </span>
    </div>
  );
}
