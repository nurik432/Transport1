"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPanel } from "@/components/map";
import { PlaceSearch } from "@/components/place-search";
import { Button, Card, Field, Panel, SectionTitle, cx, inputClass } from "@/components/ui";
import { Collapsible } from "@/components/entity-form";
import { IconCheck, IconPin, IconPlus } from "@/components/icons";
import { saveStop } from "../actions";

/**
 * Creating and editing a stop, with the map as the instrument rather than a
 * picture beside the form.
 *
 * A stop is a place, and a place is something you point at. The three ways to
 * set one — find it by name, click the map, drag the marker — all end with the
 * coordinates as a result. Typing them by hand stays available, folded away,
 * because it is the fallback and not the method.
 */

export interface StopRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  status: "active" | "inactive";
}

interface Draft {
  id: string | null;
  name: string;
  address: string;
  lat: number;
  lng: number;
  status: "active" | "inactive";
}

/** Khujand centre: where a new stop starts when nothing else points somewhere. */
const KHUJAND = { lat: 40.2833, lng: 69.6333 };

function round5(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

function draftFrom(stop: StopRow): Draft {
  return {
    id: stop.id,
    name: stop.name,
    address: stop.address ?? "",
    lat: stop.lat,
    lng: stop.lng,
    status: stop.status,
  };
}

function emptyDraft(at: { lat: number; lng: number }): Draft {
  return { id: null, name: "", address: "", lat: round5(at.lat), lng: round5(at.lng), status: "active" };
}

export function StopsWorkspace({
  stops,
  usage,
  selectedId,
}: {
  stops: StopRow[];
  /** route names per stop id, so a move can say what else it affects */
  usage: Record<string, string[]>;
  /** stop taken from ?stop=, the link the table rows point at */
  selectedId: string | null;
}) {
  const router = useRouter();
  const selected = selectedId ? stops.find((s) => s.id === selectedId) : undefined;

  // The page mounts this component with a key of the selected id, so opening a
  // stop from the table arrives as a fresh mount rather than as a prop to sync.
  const [draft, setDraft] = useState<Draft | null>(() => (selected ? draftFrom(selected) : null));
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();
  // Fly to a found place or to a stop opened from the table, but leave the view
  // alone while the marker is only being nudged on screen.
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(() =>
    selected ? { lat: selected.lat, lng: selected.lng } : null,
  );
  const [fitKey, setFitKey] = useState(0);

  function flyTo(at: { lat: number; lng: number }) {
    setFocus({ lat: at.lat, lng: at.lng });
    setFitKey((k) => k + 1);
  }

  /** New stop at this spot. Clicking the map must not move the view. */
  function beginCreate(at: { lat: number; lng: number }, over: Partial<Draft> = {}) {
    if (selectedId) router.replace("/admin/stops");
    setDraft({ ...emptyDraft(at), ...over });
    setResult(null);
  }

  /**
   * A found place moves the stop being edited, and starts a new one otherwise.
   * An existing stop keeps its own name: it is already known by it everywhere.
   */
  function pickPlace(place: { name: string; address: string; lat: number; lng: number }) {
    if (draft?.id) {
      setDraft({
        ...draft,
        lat: round5(place.lat),
        lng: round5(place.lng),
        address: draft.address.trim() || place.address,
      });
    } else {
      beginCreate(place, { name: place.name, address: place.address });
    }
    flyTo(place);
  }

  function cancel() {
    setDraft(null);
    setResult(null);
    setFocus(null);
    if (selectedId) router.replace("/admin/stops");
  }

  function move(lat: number, lng: number) {
    setDraft((prev) => (prev ? { ...prev, lat: round5(lat), lng: round5(lng) } : prev));
  }

  function submit() {
    if (!draft) return;
    setResult(null);
    start(async () => {
      const res = await saveStop({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name,
        address: draft.address,
        lat: draft.lat,
        lng: draft.lng,
        status: draft.status,
      });
      setResult(res);
      if (res.ok) {
        setDraft(null);
        if (selectedId) router.replace("/admin/stops");
        else router.refresh();
      }
    });
  }

  const editing = draft !== null;
  const affected = draft?.id ? (usage[draft.id] ?? []) : [];
  const moved =
    draft?.id && selected ? draft.lat !== selected.lat || draft.lng !== selected.lng : false;

  const mapStops = [
    ...stops
      .filter((s) => s.id !== draft?.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        note: s.address ?? undefined,
        muted: s.status === "inactive",
      })),
    ...(draft
      ? [
          {
            id: "draft",
            name: draft.name.trim() || "Новая остановка",
            lat: draft.lat,
            lng: draft.lng,
            note: "Перетащите, чтобы поправить место",
            highlight: true,
            draggable: true,
          },
        ]
      : []),
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-3">
        <Card>
          <SectionTitle>{editing ? (draft.id ? "Остановка" : "Новая остановка") : "Добавить остановку"}</SectionTitle>

          <div className="mb-3">
            <PlaceSearch
              hint="Найдите место по названию — координаты и адрес подставятся сами"
              onPick={pickPlace}
              onManual={() => {
                if (!draft) beginCreate(KHUJAND);
                flyTo(draft ?? KHUJAND);
              }}
            />
          </div>

          {!editing ? (
            <>
              <p className="text-sm text-muted-foreground">
                Или нажмите на карту справа в том месте, где садятся пассажиры.
              </p>
              <div className="mt-3">
                <Button variant="secondary" onClick={() => beginCreate(KHUJAND)}>
                  <IconPlus className="size-4" />
                  Поставить точку вручную
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <Field label="Название" error={result?.fieldErrors?.name} hint="Так остановку увидит пассажир">
                <input
                  className={inputClass}
                  value={draft.name}
                  autoFocus
                  placeholder="Панчшанбе"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>

              <Field label="Адрес" error={result?.fieldErrors?.address} hint="Необязательно, помогает узнать место">
                <input
                  className={inputClass}
                  value={draft.address}
                  placeholder="пл. Панчшанбе"
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                />
              </Field>

              <Field label="Статус">
                <select
                  className={inputClass}
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })}
                >
                  <option value="active">Активна</option>
                  <option value="inactive">Отключена</option>
                </select>
              </Field>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                <IconPin className="size-3.5" />
                {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
              </p>

              {moved && affected.length > 0 ? (
                <Panel tone="warn" className="p-3 text-sm">
                  Место изменится во всех маршрутах с этой остановкой: {affected.join(", ")}. Путь пересчитается при
                  следующем сохранении маршрута.
                </Panel>
              ) : null}

              <Collapsible title="Ввести координаты вручную">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Широта" error={result?.fieldErrors?.lat}>
                    <input
                      className={inputClass}
                      type="number"
                      step="0.00001"
                      value={draft.lat}
                      onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Долгота" error={result?.fieldErrors?.lng}>
                    <input
                      className={inputClass}
                      type="number"
                      step="0.00001"
                      value={draft.lng}
                      onChange={(e) => setDraft({ ...draft, lng: Number(e.target.value) })}
                    />
                  </Field>
                </div>
              </Collapsible>

              {result?.error ? (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-red-800">
                  {result.error}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button onClick={submit} disabled={pending}>
                  <IconCheck className="size-4" />
                  {pending ? "Сохранение…" : draft.id ? "Сохранить остановку" : "Создать остановку"}
                </Button>
                <Button variant="ghost" onClick={cancel} disabled={pending}>
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </Card>

        {result?.ok && result.message ? (
          <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-green-800">
            {result.message}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Остановку, которая уже используется в маршруте, удалить нельзя — переведите её в неактивные.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <MapPanel
          className={cx(
            "h-96 w-full rounded-[--radius-card] border",
            editing ? "border-primary" : "border-border",
          )}
          stops={mapStops}
          fitKey={fitKey}
          fitPoints={focus ? [[focus.lat, focus.lng]] : undefined}
          onMapClick={(lat, lng) => {
            if (draft) move(lat, lng);
            else beginCreate({ lat, lng });
          }}
          onStopClick={(id) => {
            if (id === "draft") return;
            router.replace(`/admin/stops?stop=${id}#stop-workspace`);
          }}
          onStopDragEnd={(id, lat, lng) => {
            if (id === "draft") move(lat, lng);
          }}
        />
        <p className="text-xs text-muted-foreground">
          {editing
            ? "Нажмите на карту или перетащите оранжевый маркер, чтобы поправить место."
            : "Нажмите на карту, чтобы создать остановку, или на существующую точку, чтобы её изменить."}
        </p>
      </div>
    </div>
  );
}
