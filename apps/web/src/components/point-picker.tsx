"use client";

import { useState } from "react";
import { MapPanel } from "./map";
import { PlaceSearch, type FoundPlace } from "./place-search";

export interface PickedPoint {
  lat: number;
  lng: number;
}

const round5 = (n: number) => Number(n.toFixed(5));

/**
 * A place is set by pointing, never by typing numbers: find it by name, tap the
 * map or drag the pin. `radiusM` draws the area around the point, e.g. the
 * geo-check radius of an attendance point.
 */
export function PointPicker({
  value,
  onChange,
  radiusM,
  optional = false,
  searchPlaceholder = "Улица, ориентир или название места",
}: {
  value: PickedPoint | null;
  /** `place` is set when the point came from the search, with its address */
  onChange: (point: PickedPoint | null, place?: FoundPlace) => void;
  radiusM?: number | null;
  /** shows "Убрать точку" so the place can be left empty */
  optional?: boolean;
  searchPlaceholder?: string;
}) {
  const [fitKey, setFitKey] = useState(0);
  const set = (lat: number, lng: number) => onChange({ lat: round5(lat), lng: round5(lng) });

  return (
    <div className="flex flex-col gap-2">
      <PlaceSearch
        label="Найти место"
        placeholder={searchPlaceholder}
        onPick={(place) => {
          onChange({ lat: round5(place.lat), lng: round5(place.lng) }, place);
          setFitKey((k) => k + 1);
        }}
      />
      <MapPanel
        className="h-64 w-full rounded-[--radius-card] border border-border"
        stops={value ? [{ id: "point", name: "Точка", lat: value.lat, lng: value.lng, draggable: true, highlight: true }] : []}
        areas={
          value && radiusM
            ? [{ id: "radius", lat: value.lat, lng: value.lng, radiusM, label: `Радиус ${radiusM} м` }]
            : undefined
        }
        fitKey={fitKey}
        fitPoints={value ? [[value.lat, value.lng]] : undefined}
        onMapClick={set}
        onStopDragEnd={(_, lat, lng) => set(lat, lng)}
      />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {value
            ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} · нажмите на карту или перетащите точку, чтобы поправить`
            : "Найдите место по названию или нажмите на карту"}
        </span>
        {optional && value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-9 shrink-0 cursor-pointer font-medium text-primary hover:underline"
          >
            Убрать точку
          </button>
        ) : null}
      </div>
    </div>
  );
}
