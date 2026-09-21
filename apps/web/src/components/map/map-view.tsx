"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
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
}

export interface MapViewProps {
  stops: MapStop[];
  lines?: MapLine[];
  me?: { lat: number; lng: number } | null;
  className?: string;
  /** falls back to Khujand centre when there is nothing to show */
  center?: [number, number];
  zoom?: number;
}

const KHUJAND: [number, number] = [40.2833, 69.6333];

function FitBounds({ stops, me }: { stops: MapStop[]; me?: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = stops.map((s) => [s.lat, s.lng]);
    if (me) points.push([me.lat, me.lng]);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0]!, 15);
      return;
    }
    map.fitBounds(points, { padding: [32, 32], maxZoom: 16 });
  }, [map, stops, me]);
  return null;
}

export default function MapView({ stops, lines = [], me, className, center, zoom = 13 }: MapViewProps) {
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
        <Polyline key={line.id} positions={line.points} pathOptions={{ color: line.color, weight: 4, opacity: 0.85 }} />
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
      {me ? (
        <CircleMarker
          center={[me.lat, me.lng]}
          radius={7}
          pathOptions={{ color: "#ffffff", fillColor: "#2563eb", fillOpacity: 1, weight: 3 }}
        >
          <Popup>Моё местоположение</Popup>
        </CircleMarker>
      ) : null}
      <FitBounds stops={stops} me={me} />
    </MapContainer>
  );
}
