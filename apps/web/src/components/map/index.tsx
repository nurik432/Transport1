"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { MapViewProps } from "./map-view";

/** Leaflet touches `window`, so the map is client-only. */
const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-[--radius-card] bg-muted" />,
});

/**
 * Embedded map with a full-screen mode. The embedded map keeps page scrolling
 * (wheel zoom only after a click); full screen gives the whole display to the
 * map with wheel and pinch zoom. Escape or the close button returns.
 */
export function MapPanel({ expandable = true, ...props }: MapViewProps & { expandable?: boolean }) {
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  return (
    <>
      <MapView {...props} onToggleFullscreen={expandable ? () => setFull(true) : undefined} />
      {full
        ? createPortal(
            <div className="fixed inset-0 z-[2000] bg-background" role="dialog" aria-modal="true" aria-label="Карта">
              <MapView {...props} className="h-full w-full" fullscreen onToggleFullscreen={() => setFull(false)} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export type { MapStop, MapLine, MapVehicle, MapArea, MapViewProps } from "./map-view";
