"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface MapStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** optional caption under the name, e.g. planned time or load */
  note?: string;
  highlight?: boolean;
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

export interface MapViewProps {
  stops: MapStop[];
  lines?: MapLine[];
  vehicles?: MapVehicle[];
  me?: { lat: number; lng: number } | null;
  className?: string;
  /** falls back to Khujand centre when there is nothing to show */
  center?: [number, number];
  zoom?: number;
  /** keep the current view when data updates */
  autoFit?: boolean;
}

const KHUJAND: [number, number] = [40.2833, 69.6333];

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

function FitBounds({
  stops,
  me,
  vehicles,
  enabled,
}: {
  stops: MapStop[];
  me?: { lat: number; lng: number } | null;
  vehicles: MapVehicle[];
  enabled: boolean;
}) {
  const map = useMap();
  // Fit to the stops only: vehicle updates should not move the map under the user.
  const key = useMemo(() => stops.map((s) => s.id).join("|"), [stops]);

  useEffect(() => {
    if (!enabled) return;
    const points: [number, number][] = stops.map((s) => [s.lat, s.lng]);
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
  lines = [],
  vehicles = [],
  me,
  className,
  center,
  zoom = 13,
  autoFit = true,
}: MapViewProps) {
  return (
    <MapContainer
      center={center ?? KHUJAND}
      zoom={zoom}
      scrollWheelZoom={false}
      className={className ?? "h-64 w-full rounded-[--radius-card]"}
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
      {stops.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={s.highlight ? 9 : 6}
          pathOptions={{
            color: s.highlight ? "#ea580c" : "#1e3a8a",
            fillColor: s.highlight ? "#ea580c" : "#ffffff",
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Popup>
            <span className="font-medium">{s.name}</span>
            {s.note ? <div className="text-xs text-slate-600">{s.note}</div> : null}
          </Popup>
        </CircleMarker>
      ))}
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
      <FitBounds stops={stops} me={me} vehicles={vehicles} enabled={autoFit} />
    </MapContainer>
  );
}
