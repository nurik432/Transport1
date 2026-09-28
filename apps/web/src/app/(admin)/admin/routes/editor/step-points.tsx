"use client";

import { useState } from "react";
import { MapPanel } from "@/components/map";
import { PlaceSearch } from "@/components/place-search";
import { Button, Field, inputClass } from "@/components/ui";
import { IconPin, IconPlus, IconRoute } from "@/components/icons";
import { formatKm } from "./types";
import { justDragged, noteDragEnd, type RouteEditor } from "./use-route-editor";
import type { RoutePath } from "./use-route-path";

/**
 * Placing the route on the map.
 *
 * Three ways in, all ending in a point on the map: find a place by name, click
 * an existing stop, or click empty space. The road path and the travel times
 * follow on their own — there is no button to press before the times appear.
 */
export function StepPoints({ editor, path }: { editor: RouteEditor; path: RoutePath }) {
  const { value } = editor;
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingName, setPendingName] = useState("");

  function addPending() {
    if (!pending) return;
    editor.addPlacePoint({ name: pendingName, lat: pending.lat, lng: pending.lng });
    setPending(null);
    setPendingName("");
  }

  const mapStops = [
    ...value.stops.map((s, i) => ({
      id: s.uid,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      order: i + 1,
      draggable: true,
      note: `Через ${s.offsetMin} мин${s.stopId ? "" : " · новая остановка"}`,
    })),
    ...editor.stopOptions
      .filter((s) => !editor.usedStopIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, muted: true, note: "Нажмите, чтобы добавить" })),
    ...(pending
      ? [{ id: "pending", name: pendingName.trim() || "Новая точка", lat: pending.lat, lng: pending.lng, highlight: true }]
      : []),
  ];

  const line = {
    id: "editing",
    color: value.color,
    points: path.points ?? value.stops.map((s) => [s.lat, s.lng] as [number, number]),
    // Dashes mean "these are not roads", whether the path is missing or straight.
    dashed: path.points === null || path.source === "straight",
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-md">
        <PlaceSearch
          hint="Например, «Панчшанбе» — точка встанет там, где нужно"
          onPick={(place) => editor.addPlacePoint(place)}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Или нажмите на карту, чтобы поставить новую остановку, либо на серую точку — чтобы добавить существующую.
        Готовые точки можно перетаскивать.
      </p>

      {pending ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-primary bg-primary-soft/40 p-3">
          <div className="min-w-48 flex-1">
            <Field
              label="Название новой остановки"
              hint={`${pending.lat.toFixed(5)}, ${pending.lng.toFixed(5)}`}
            >
              <input
                className={inputClass}
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                placeholder="Например, Микрорайон 21"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPending();
                  }
                }}
              />
            </Field>
          </div>
          <Button onClick={addPending}>
            <IconPlus className="size-4" />
            Добавить точку
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setPending(null);
              setPendingName("");
            }}
          >
            Отмена
          </Button>
        </div>
      ) : null}

      <MapPanel
        className="h-96 w-full rounded-[--radius-card] border border-border"
        stops={mapStops}
        lines={value.stops.length >= 2 ? [line] : []}
        onMapClick={(lat, lng) => {
          if (justDragged()) return;
          setPending({ lat, lng });
          setPendingName("");
        }}
        onStopClick={(id) => {
          if (justDragged()) return;
          if (!value.stops.some((s) => s.uid === id) && id !== "pending") editor.addExistingStop(id);
        }}
        onStopDragEnd={(id, lat, lng) => {
          noteDragEnd();
          editor.movePointTo(id, lat, lng);
        }}
      />

      <PathStatus path={path} pointCount={value.stops.length} />
    </div>
  );
}

/** One line about the road path, in the same place whatever it says. */
function PathStatus({ path, pointCount }: { path: RoutePath; pointCount: number }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <IconPin className="size-3.5" />
        Точек в маршруте: {pointCount}
      </span>

      {path.state === "loading" ? <span>Считаем путь по дорогам…</span> : null}

      {path.state === "ready" && path.source === "road" && path.distanceM !== null ? (
        <span>Путь по дорогам: {formatKm(path.distanceM)} · время в пути подставлено</span>
      ) : null}

      {path.state === "ready" && path.source === "straight" ? (
        <span className="flex items-center gap-2 text-warn-foreground">
          Маршрутизатор недоступен, показаны прямые линии — время оставлено как есть
          <Button variant="secondary" className="min-h-8 px-2 text-xs" onClick={path.recompute}>
            <IconRoute className="size-3.5" />
            Повторить
          </Button>
        </span>
      ) : null}

      {path.state === "ready" && path.source === null && pointCount >= 2 ? (
        <span className="flex items-center gap-2">
          Путь по дорогам ещё не построен
          <Button variant="secondary" className="min-h-8 px-2 text-xs" onClick={path.recompute}>
            <IconRoute className="size-3.5" />
            Построить
          </Button>
        </span>
      ) : null}

      {path.state === "idle" ? <span>Добавьте вторую точку, чтобы построить путь.</span> : null}
    </p>
  );
}
