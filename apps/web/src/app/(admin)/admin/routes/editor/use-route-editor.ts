"use client";

import { useMemo, useState } from "react";
import { normalizeRouteForm, validateRouteForm, type RouteFormInput, type RouteFormProblems } from "@transport/domain";
import type { EditorPoint, RouteEditorInit, RouteEditorValue, StopOption } from "./types";

/**
 * The route form's state and every way of changing it.
 *
 * It knows nothing about steps or about the flat page: the wizard and the edit
 * screen share this hook and differ only in how they lay the same parts out.
 */

let counter = 0;

/** Local id for a point. Only has to be unique within this form. */
function nextUid(): string {
  counter += 1;
  return `p${counter}`;
}

function withUids(stops: RouteEditorInit["stops"]): EditorPoint[] {
  // Offsets loaded from the database are treated as automatic: which of them
  // were typed by hand is not recorded, and a wrong "manual" would freeze a
  // time forever. An applied recalculation is offered back as undo instead.
  return stops.map((s) => ({ ...s, uid: nextUid(), offsetManual: false }));
}

export interface RouteEditor {
  value: RouteEditorValue;
  set: <K extends keyof RouteEditorValue>(key: K, v: RouteEditorValue[K]) => void;

  addExistingStop: (stopId: string) => void;
  addPlacePoint: (place: { name: string; address?: string; lat: number; lng: number }) => void;
  replaceStop: (index: number, stopId: string) => void;
  renamePoint: (index: number, name: string) => void;
  setOffset: (index: number, minutes: number) => void;
  clearManualOffset: (index: number) => void;
  removePoint: (index: number) => void;
  /** arrows: move one position up or down */
  nudgePoint: (index: number, delta: -1 | 1) => void;
  /** drag and drop: move a point to another position */
  reorder: (from: number, to: number) => void;
  /** a marker was dropped somewhere else */
  movePointTo: (uid: string, lat: number, lng: number) => void;
  /** times computed from the road path; manual ones are kept */
  applyOffsets: (suggested: number[]) => void;

  stopOptions: StopOption[];
  usedStopIds: Set<string>;
  problems: RouteFormProblems;
  formInput: RouteFormInput;
  dirty: boolean;
  /** call after a successful save so the form stops counting as changed */
  markSaved: () => void;
}

export function useRouteEditor(initial: RouteEditorInit, stopOptions: StopOption[]): RouteEditor {
  const [value, setValue] = useState<RouteEditorValue>(() => ({ ...initial, stops: withUids(initial.stops) }));
  const [savedAt, setSavedAt] = useState(() =>
    normalizeRouteForm(toFormInput({ ...initial, stops: withUids(initial.stops) })),
  );

  const patch = (next: Partial<RouteEditorValue>) => setValue((prev) => ({ ...prev, ...next }));
  const setStops = (stops: EditorPoint[]) => patch({ stops });

  const usedStopIds = useMemo(
    () => new Set(value.stops.map((s) => s.stopId).filter((id): id is string => Boolean(id))),
    [value.stops],
  );

  const formInput = useMemo(() => toFormInput(value), [value]);
  const problems = useMemo(() => validateRouteForm(formInput), [formInput]);
  const normalized = useMemo(() => normalizeRouteForm(formInput), [formInput]);

  // A new point continues the rhythm of the previous ones until the path is
  // measured; five minutes apart is close enough to look deliberate.
  const nextOffset = () => (value.stops.at(-1)?.offsetMin ?? -5) + 5;

  const editor: RouteEditor = {
    value,
    set: (key, v) => patch({ [key]: v } as Partial<RouteEditorValue>),

    addExistingStop(stopId) {
      const stop = stopOptions.find((s) => s.id === stopId);
      if (!stop || usedStopIds.has(stopId)) return;
      setStops([
        ...value.stops,
        {
          uid: nextUid(),
          stopId: stop.id,
          name: stop.name,
          address: "",
          lat: stop.lat,
          lng: stop.lng,
          offsetMin: nextOffset(),
          offsetManual: false,
        },
      ]);
    },

    addPlacePoint(place) {
      setStops([
        ...value.stops,
        {
          uid: nextUid(),
          stopId: null,
          name: place.name.trim() || "Новая остановка",
          address: place.address?.trim() ?? "",
          lat: round5(place.lat),
          lng: round5(place.lng),
          offsetMin: nextOffset(),
          offsetManual: false,
        },
      ]);
    },

    replaceStop(index, stopId) {
      const stop = stopOptions.find((o) => o.id === stopId);
      const current = value.stops[index];
      if (!stop || !current) return;
      const next = [...value.stops];
      next[index] = { ...current, stopId: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng };
      setStops(next);
    },

    renamePoint(index, name) {
      const current = value.stops[index];
      if (!current) return;
      const next = [...value.stops];
      next[index] = { ...current, name };
      setStops(next);
    },

    setOffset(index, minutes) {
      const current = value.stops[index];
      if (!current) return;
      const next = [...value.stops];
      next[index] = { ...current, offsetMin: minutes, offsetManual: true };
      setStops(next);
    },

    clearManualOffset(index) {
      const current = value.stops[index];
      if (!current) return;
      const next = [...value.stops];
      next[index] = { ...current, offsetManual: false };
      setStops(next);
    },

    removePoint(index) {
      setStops(value.stops.filter((_, i) => i !== index));
    },

    nudgePoint(index, delta) {
      editor.reorder(index, index + delta);
    },

    reorder(from, to) {
      if (from === to || to < 0 || to >= value.stops.length) return;
      const next = [...value.stops];
      const [item] = next.splice(from, 1);
      if (!item) return;
      next.splice(to, 0, item);
      setStops(next);
    },

    movePointTo(uid, lat, lng) {
      setStops(value.stops.map((s) => (s.uid === uid ? { ...s, lat: round5(lat), lng: round5(lng) } : s)));
    },

    applyOffsets(suggested) {
      let changed = false;
      const next = value.stops.map((s, i) => {
        const minutes = suggested[i];
        if (s.offsetManual || minutes === undefined || minutes === s.offsetMin) return s;
        changed = true;
        return { ...s, offsetMin: minutes };
      });
      if (changed) setStops(next);
    },

    stopOptions,
    usedStopIds,
    problems,
    formInput,
    dirty: normalized !== savedAt,
    markSaved: () => setSavedAt(normalized),
  };

  return editor;
}

function round5(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

/** The form as the shared rules expect it. */
export function toFormInput(value: RouteEditorValue): RouteFormInput {
  return {
    name: value.name,
    direction: value.direction,
    status: value.status,
    color: value.color,
    plannedCapacity: value.plannedCapacity === "" ? null : Number(value.plannedCapacity),
    stops: value.stops,
    departures: value.departures,
    daysOfWeek: value.daysOfWeek,
  };
}

/** Coordinates and order only: what the road path depends on. */
export function pathKey(stops: readonly { lat: number; lng: number }[]): string {
  return stops.map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join(";");
}

/** Kept out of the hook so a stale render cannot hold on to it. */
export const dragGuard = { until: 0 };

/**
 * Leaflet can report a short drag as a click. A click on the map adds a point
 * and a click on a marker removes or selects one, so both are ignored for a
 * moment after a drag ends.
 */
export function justDragged(): boolean {
  return Date.now() < dragGuard.until;
}

export function noteDragEnd(): void {
  dragGuard.until = Date.now() + 250;
}

export type { RouteFormProblems };
