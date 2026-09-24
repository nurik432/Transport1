"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { cx } from "@/components/ui";
import { IconClose, IconExpand, IconLocate } from "@/components/icons";

export interface MapStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** optional caption under the name, e.g. planned time or load */
  note?: string;
  highlight?: boolean;
  /** position in a route: drawn as a numbered pin instead of a dot */
  order?: number;
  /** a stop that is available but not part of the route yet; for a numbered pin — already passed */
  muted?: boolean;
  /** numbered pin colour; defaults to the first line's colour */
  color?: string;
}

export interface MapLine {
  id: string;
  color: string;
  points: [number, number][];
  dashed?: boolean;
}

export interface MapVehicle {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  note?: string;
  /** dims the marker when the position is old */
  stale?: boolean;
  /** red ring when the vehicle is off its route */
  alert?: boolean;
}

/** A shaded area, used to show where a group of employees lives. */
export interface MapArea {
  id: string;
  lat: number;
  lng: number;
  radiusM: number;
  label: string;
  note?: string;
  /** draws the area in the warning colour */
  alert?: boolean;
}

export interface MapViewProps {
  stops: MapStop[];
  areas?: MapArea[];
  lines?: MapLine[];
  vehicles?: MapVehicle[];
  me?: { lat: number; lng: number } | null;
  className?: string;
  /** falls back to Khujand centre when there is nothing to show */
  center?: [number, number];
  zoom?: number;
  /** keep the current view when data updates */
  autoFit?: boolean;
  /** called when the map itself is clicked, for placing a new point */
  onMapClick?: (lat: number, lng: number) => void;
  /** called when a stop marker is clicked */
  onStopClick?: (stopId: string) => void;
  /** keeps this point centred as it moves (navigation mode) */
  follow?: { lat: number; lng: number } | null;
  /** called when the user drags the map, e.g. to stop following */
  onUserMove?: () => void;
  /** change it to fit the stops again */
  fitKey?: string | number;
  /** fit these points instead of the stops, e.g. a walking path */
  fitPoints?: [number, number][];
  /** where the "my location" button centres the map; defaults to `me`, null hides it */
  locateTo?: { lat: number; lng: number } | null;
  /** full-screen map: wheel zoom always on, the toggle closes it */
  fullscreen?: boolean;
  /** shows the expand (or, in full screen, close) button */
  onToggleFullscreen?: () => void;
}

const KHUJAND: [number, number] = [40.2833, 69.6333];

// Leaflet ends a zoom animation from a 250 ms timer that map.remove() doesn't
// cancel; a map closed mid-zoom (full screen closed, card hidden) then throws
// on the removed pane. Skip the tail when the map is already gone.
type ZoomEnd = { _mapPane?: HTMLElement; _onZoomTransitionEnd: () => void };
const leafletMap = L.Map.prototype as unknown as ZoomEnd;
const zoomTransitionEnd = leafletMap._onZoomTransitionEnd;
leafletMap._onZoomTransitionEnd = function (this: ZoomEnd) {
  if (this._mapPane) zoomTransitionEnd.call(this);
};

function vehicleIcon(v: MapVehicle): L.DivIcon {
  const ring = v.alert ? "box-shadow:0 0 0 3px #dc2626" : "box-shadow:0 1px 4px rgba(15,23,42,.45)";
  const opacity = v.stale ? "opacity:.55;" : "";
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="${opacity}display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:${v.color};border:2px solid #fff;${ring}">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11"/><path d="M5 11h14M4 17h16"/>
        <circle cx="8" cy="19" r="1.4"/><circle cx="16" cy="19" r="1.4"/>
      </svg></div>`,
  });
}

function orderedIcon(stop: MapStop, color: string): L.DivIcon {
  const size = stop.highlight ? 32 : 26;
  const background = stop.muted ? "#94a3b8" : color;
  const ring = stop.highlight ? "box-shadow:0 0 0 3px #ea580c" : "box-shadow:0 1px 3px rgba(15,23,42,.4)";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${background};border:2px solid #fff;${ring};color:#fff;font:600 12px/1 system-ui,sans-serif">${stop.order}</div>`,
  });
}

/** Keeps a moving point in view, zooming in once when following starts. */
function Follow({ point }: { point: { lat: number; lng: number } }) {
  const map = useMap();
  const zoomed = useRef(false);
  useEffect(() => {
    if (!zoomed.current) {
      zoomed.current = true;
      map.setView([point.lat, point.lng], Math.max(map.getZoom(), 16));
    } else {
      map.panTo([point.lat, point.lng]);
    }
  }, [map, point.lat, point.lng]);
  return null;
}

/**
 * An embedded map must not steal page scrolling: wheel zoom turns on once the
 * map is clicked and off again when the pointer leaves it.
 */
function WheelOnClick() {
  const map = useMap();
  useMapEvents({
    click: () => map.scrollWheelZoom.enable(),
    mouseout: () => map.scrollWheelZoom.disable(),
  });
  return null;
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
    >
      {children}
    </button>
  );
}

function UserMove({ onUserMove }: { onUserMove: () => void }) {
  useMapEvents({ dragstart: onUserMove });
  return null;
}

/** Turns clicks on empty map space into a callback. */
function ClickCatcher({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) => onMapClick(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

function FitBounds({
  stops,
  me,
  vehicles,
  areas,
  enabled,
  fitKey,
  fitPoints,
}: {
  fitKey?: string | number;
  fitPoints?: [number, number][];
  stops: MapStop[];
  me?: { lat: number; lng: number } | null;
  vehicles: MapVehicle[];
  areas: MapArea[];
  enabled: boolean;
}) {
  const map = useMap();
  // Fit to the stops only: vehicle updates should not move the map under the user.
  const key = useMemo(
    () => [fitKey ?? "", ...stops.map((s) => s.id), ...areas.map((a) => a.id)].join("|"),
    [stops, areas, fitKey],
  );

  useEffect(() => {
    if (!enabled) return;
    const points: [number, number][] = fitPoints?.length ? [...fitPoints] : stops.map((s) => [s.lat, s.lng]);
    if (!fitPoints?.length) points.push(...areas.map((a) => [a.lat, a.lng] as [number, number]));
    if (me) points.push([me.lat, me.lng]);
    if (points.length === 0 && vehicles.length) points.push(...vehicles.map((v) => [v.lat, v.lng] as [number, number]));
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0]!, 15);
      return;
    }
    map.fitBounds(points, { padding: [32, 32], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, enabled]);

  return null;
}

export default function MapView({
  stops,
  areas = [],
  lines = [],
  vehicles = [],
  me,
  className,
  center,
  zoom = 13,
  autoFit = true,
  onMapClick,
  onStopClick,
  follow,
  onUserMove,
  fitKey,
  fitPoints,
  locateTo,
  fullscreen = false,
  onToggleFullscreen,
}: MapViewProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const locatePoint = locateTo === undefined ? me : locateTo;

  return (
    <div className={cx("relative isolate overflow-hidden", className ?? "h-64 w-full rounded-[--radius-card]")}>
    <MapContainer
      ref={setMap}
      center={center ?? KHUJAND}
      zoom={zoom}
      scrollWheelZoom={fullscreen}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {lines.map((line) => (
        <Polyline
          key={line.id}
          positions={line.points}
          pathOptions={{
            color: line.color,
            weight: line.dashed ? 3 : 4,
            opacity: line.dashed ? 0.7 : 0.85,
            dashArray: line.dashed ? "6 8" : undefined,
          }}
        />
      ))}
      {areas.map((a) => (
        <Circle
          key={a.id}
          center={[a.lat, a.lng]}
          radius={a.radiusM}
          pathOptions={{
            color: a.alert ? "#ea580c" : "#2563eb",
            fillColor: a.alert ? "#ea580c" : "#2563eb",
            fillOpacity: 0.16,
            weight: 2,
            dashArray: a.alert ? undefined : "4 6",
          }}
        >
          <Popup>
            <span className="font-medium">{a.label}</span>
            {a.note ? <div className="text-xs text-slate-600">{a.note}</div> : null}
          </Popup>
        </Circle>
      ))}
      {stops.map((s) =>
        s.order !== undefined ? (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={orderedIcon(s, s.color ?? lines[0]?.color ?? "#2563eb")}
            zIndexOffset={300}
            bubblingMouseEvents={false}
            eventHandlers={onStopClick ? { click: () => onStopClick(s.id) } : undefined}
          >
            <Popup>
              <span className="font-medium">
                {s.order}. {s.name}
              </span>
              {s.note ? <div className="text-xs text-slate-600">{s.note}</div> : null}
            </Popup>
          </Marker>
        ) : (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={s.highlight ? 9 : s.muted ? 5 : 6}
            bubblingMouseEvents={false}
            eventHandlers={onStopClick ? { click: () => onStopClick(s.id) } : undefined}
            pathOptions={{
              color: s.highlight ? "#ea580c" : s.muted ? "#94a3b8" : "#1e3a8a",
              fillColor: s.highlight ? "#ea580c" : "#ffffff",
              fillOpacity: s.muted ? 0.9 : 1,
              weight: s.muted ? 2 : 3,
            }}
          >
            <Popup>
              <span className="font-medium">{s.name}</span>
              {s.note ? <div className="text-xs text-slate-600">{s.note}</div> : null}
            </Popup>
          </CircleMarker>
        ),
      )}
      {vehicles.map((v) => (
        <Marker key={v.id} position={[v.lat, v.lng]} icon={vehicleIcon(v)} zIndexOffset={500}>
          <Popup>
            <span className="font-medium">{v.label}</span>
            {v.note ? <div className="text-xs text-slate-600">{v.note}</div> : null}
          </Popup>
        </Marker>
      ))}
      {me ? (
        <CircleMarker
          center={[me.lat, me.lng]}
          radius={7}
          pathOptions={{ color: "#ffffff", fillColor: "#2563eb", fillOpacity: 1, weight: 3 }}
        >
          <Popup>Моё местоположение</Popup>
        </CircleMarker>
      ) : null}
      {onMapClick ? <ClickCatcher onMapClick={onMapClick} /> : null}
      <FitBounds stops={stops} me={me} vehicles={vehicles} areas={areas} enabled={autoFit} fitKey={fitKey} fitPoints={fitPoints} />
      {follow ? <Follow point={follow} /> : null}
      {onUserMove ? <UserMove onUserMove={onUserMove} /> : null}
      {fullscreen ? null : <WheelOnClick />}
    </MapContainer>
    <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-2">
      {onToggleFullscreen ? (
        <MapButton label={fullscreen ? "Закрыть" : "На весь экран"} onClick={onToggleFullscreen}>
          {fullscreen ? <IconClose className="size-5" /> : <IconExpand className="size-5" />}
        </MapButton>
      ) : null}
      {locatePoint && map ? (
        <MapButton
          label="Где я"
          onClick={() => map.setView([locatePoint.lat, locatePoint.lng], Math.max(map.getZoom(), 16))}
        >
          <IconLocate className="size-5" />
        </MapButton>
      ) : null}
    </div>
    </div>
  );
}
