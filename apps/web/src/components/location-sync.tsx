"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconPin } from "./icons";

/**
 * Asks for geolocation once and puts the coordinates in the URL so the server
 * page can compute nearest stops. Silently falls back to the home address.
 * A browser that already holds a denial rejects instantly without prompting.
 */
export function LocationSync({ hasCoords }: { hasCoords: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (hasCoords || typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const next = new URLSearchParams(params.toString());
        next.set("lat", pos.coords.latitude.toFixed(5));
        next.set("lng", pos.coords.longitude.toFixed(5));
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      },
      () => {
        if (!cancelled) setDenied(true);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );

    return () => {
      cancelled = true;
    };
  }, [hasCoords, params, pathname, router]);

  if (!denied || hasCoords) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
      <IconPin className="size-4" />
      Геолокация недоступна — показываем остановки рядом с домашним адресом.
    </p>
  );
}
