"use client";

import dynamic from "next/dynamic";
import type { MapViewProps } from "./map-view";

/** Leaflet touches `window`, so the map is client-only. */
const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-[--radius-card] bg-muted" />,
});

export function MapPanel(props: MapViewProps) {
  return <MapView {...props} />;
}

export type { MapStop, MapLine, MapViewProps } from "./map-view";
