"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPanel } from "@/components/map";
import { Button, Card, Field, SectionTitle, cx, inputClass } from "@/components/ui";
import { IconCheck, IconMinus, IconPin, IconPlus, IconRoute } from "@/components/icons";
import { saveRoute } from "../actions";

export interface StopOption {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** One point of the route: an existing stop, or a place clicked on the map. */
export interface EditorPoint {
  /** null for a point placed on the map; the stop is created on save */
  stopId: string | null;
  name: string;
  lat: number;
  lng: number;
  offsetMin: number;
}

export interface RouteEditorValue {
  id?: string;
  name: string;
  description: string;
  direction: "to_work" | "from_work";
  status: "draft" | "active" | "inactive";
  color: string;
  plannedCapacity: string;
  stops: EditorPoint[];
  departures: string[];
  daysOfWeek: number[];
}

export interface VersionSummary {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  isCurrent: boolean;
  stopCount: number;
  tripCount: number;
  completedTripCount: number;
  pathSource: "road" | "straight" | null;
  pathDistanceM: number | null;
  stopNames: string[];
}

interface PreviewState {
  points: [number, number][];
  totalDistanceM: number;
  source: "road" | "straight";
  suggestedOffsets: number[];
  error?: string;
}

const WEEKDAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ea580c", "#7c3aed", "#0891b2"];

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1).replace(".", ",")} км`;
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Dushanbe",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function RouteEditor({
  initial,
  stopOptions,
  versions = [],
  savedPath = null,
  savedDistanceM = null,
  suggestedDeparture = null,
}: {
  initial: RouteEditorValue;
  stopOptions: StopOption[];
  versions?: VersionSummary[];
  /** geometry of the version being edited, shown until the shape is changed */
  savedPath?: [number, number][] | null;
  savedDistanceM?: number | null;
  /** departure proposed by the analysis screen, pre-filled in the schedule */
  suggestedDeparture?: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<RouteEditorValue>(initial);
  const [versionNote, setVersionNote] = useState("");
  const [newDeparture, setNewDeparture] = useState(suggestedDeparture ?? "");
  const [pendingPoint, setPendingPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingName, setPendingName] = useState("");
  // Start from the saved geometry; any change to the shape clears it.
  const [preview, setPreview] = useState<PreviewState | null>(
    savedPath && savedPath.length >= 2
      ? { points: savedPath, totalDistanceM: savedDistanceM ?? 0, source: "road", suggestedOffsets: [] }
      : null,
  );
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const [previewing, setPreviewing] = useState(false);

  const set = <K extends keyof RouteEditorValue>(key: K, v: RouteEditorValue[K]) =>
    setValue((prev) => ({ ...prev, [key]: v }));

  /** Any edit to the shape invalidates a previously fetched preview. */
  function setStops(stops: EditorPoint[]) {
    setValue((prev) => ({ ...prev, stops }));
    setPreview(null);
  }

  const usedStopIds = new Set(value.stops.map((s) => s.stopId).filter((id): id is string => Boolean(id)));
  const nextOffset = (value.stops.at(-1)?.offsetMin ?? -5) + 5;

  function addExistingStop(stopId: string) {
    const stop = stopOptions.find((s) => s.id === stopId);
    if (!stop || usedStopIds.has(stopId)) return;
    setStops([...value.stops, { stopId: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng, offsetMin: nextOffset }]);
  }

  function addPendingPoint() {
    if (!pendingPoint) return;
    setStops([
      ...value.stops,
      {
        stopId: null,
        name: pendingName.trim() || "Новая остановка",
        lat: Number(pendingPoint.lat.toFixed(5)),
        lng: Number(pendingPoint.lng.toFixed(5)),
        offsetMin: nextOffset,
      },
    ]);
    setPendingPoint(null);
    setPendingName("");
  }

  function moveStop(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= value.stops.length) return;
    const next = [...value.stops];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    setStops(next);
  }

  async function loadPreview() {
    if (value.stops.length < 2) return;
    setPreviewing(true);
    try {
      const response = await fetch("/api/v1/routing/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ points: value.stops.map((s) => ({ lat: s.lat, lng: s.lng })) }),
      });
      const json = await response.json();
      if (json.ok) {
        setPreview({
          points: json.points,
          totalDistanceM: json.totalDistanceM,
          source: json.source,
          suggestedOffsets: json.suggestedOffsets,
          error: json.error,
        });
      } else {
        setPreview(null);
      }
    } catch {
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  function applySuggestedOffsets() {
    if (!preview) return;
    setValue((prev) => ({
      ...prev,
      stops: prev.stops.map((s, i) => ({ ...s, offsetMin: preview.suggestedOffsets[i] ?? s.offsetMin })),
    }));
  }

  function submit() {
    setResult(null);
    start(async () => {
      const res = await saveRoute({
        ...(value.id ? { id: value.id } : {}),
        name: value.name,
        description: value.description,
        direction: value.direction,
        status: value.status,
        color: value.color,
        plannedCapacity: value.plannedCapacity === "" ? null : Number(value.plannedCapacity),
        stops: value.stops,
        departures: value.departures,
        daysOfWeek: value.daysOfWeek,
        versionNote: versionNote || undefined,
      });
      setResult(res);
      if (res.ok && res.id && !value.id) router.push(`/admin/routes/${res.id}`);
      else if (res.ok) {
        setVersionNote("");
        router.refresh();
      }
    });
  }

  const mapStops = [
    ...value.stops.map((s, i) => ({
      id: `pt-${i}`,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      order: i + 1,
      note: `Через ${s.offsetMin} мин${s.stopId ? "" : " · новая остановка"}`,
    })),
    ...stopOptions
      .filter((s) => !usedStopIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, muted: true, note: "Нажмите, чтобы добавить" })),
  ];

  const mapLine = {
    id: "editing",
    color: value.color,
    points: preview?.points ?? value.stops.map((s) => [s.lat, s.lng] as [number, number]),
    dashed: !preview,
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <SectionTitle>Основное</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Номер маршрута">
            <input className={inputClass} value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="№5" />
          </Field>
          <Field label="Направление" hint="Утро и вечер — два отдельных маршрута с одним номером">
            <select
              className={inputClass}
              value={value.direction}
              onChange={(e) => set("direction", e.target.value as RouteEditorValue["direction"])}
            >
              <option value="to_work">Утро · на работу</option>
              <option value="from_work">Вечер · домой</option>
            </select>
          </Field>
          <Field label="Статус">
            <select
              className={inputClass}
              value={value.status}
              onChange={(e) => set("status", e.target.value as RouteEditorValue["status"])}
            >
              <option value="active">Активен</option>
              <option value="draft">Черновик</option>
              <option value="inactive">Отключён</option>
            </select>
          </Field>
          <Field label="Описание">
            <input
              className={inputClass}
              value={value.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Микрорайоны — Центр — Офис"
            />
          </Field>
          <Field label="Плановая вместимость" hint="Используется, пока транспорт не назначен">
            <input
              className={inputClass}
              type="number"
              value={value.plannedCapacity}
              onChange={(e) => set("plannedCapacity", e.target.value)}
              placeholder="30"
            />
          </Field>
          <Field label="Цвет на карте">
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Цвет ${c}`}
                  aria-pressed={value.color === c}
                  onClick={() => set("color", c)}
                  className={cx(
                    "size-8 cursor-pointer rounded-lg border-2 transition-transform",
                    value.color === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
        </div>
      </Card>

      {/* ------------------------------------------------------------ map editor */}
      <Card>
        <SectionTitle
          action={
            <span className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="min-h-9 px-3 text-sm"
                disabled={previewing || value.stops.length < 2}
                onClick={() => void loadPreview()}
              >
                <IconRoute className="size-4" />
                {previewing ? "Строим…" : "Показать путь по дорогам"}
              </Button>
              {preview && preview.suggestedOffsets.length > 0 ? (
                <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={applySuggestedOffsets}>
                  <IconCheck className="size-4" />
                  Подставить время
                </Button>
              ) : null}
            </span>
          }
        >
          Точки маршрута на карте
        </SectionTitle>

        <p className="mb-3 text-sm text-muted-foreground">
          Нажмите на карту, чтобы поставить новую остановку, или на серую точку — чтобы добавить существующую.
          Порядок точек задаёт порядок движения.
        </p>

        {pendingPoint ? (
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-primary bg-primary-soft/40 p-3">
            <div className="min-w-48 flex-1">
              <Field label="Название новой остановки" hint={`${pendingPoint.lat.toFixed(5)}, ${pendingPoint.lng.toFixed(5)}`}>
                <input
                  className={inputClass}
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  placeholder="Например, Микрорайон 21"
                  autoFocus
                />
              </Field>
            </div>
            <Button onClick={addPendingPoint}>
              <IconPlus className="size-4" />
              Добавить точку
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingPoint(null);
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
          lines={value.stops.length >= 2 ? [mapLine] : []}
          autoFit={false}
          zoom={12}
          onMapClick={(lat, lng) => {
            setPendingPoint({ lat, lng });
            setPendingName("");
          }}
          onStopClick={(id) => {
            if (!id.startsWith("pt-")) addExistingStop(id);
          }}
        />

        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <IconPin className="size-3.5" />
            Точек в маршруте: {value.stops.length}
          </span>
          {preview ? (
            <span>
              {preview.source === "road"
                ? `Путь по дорогам: ${formatKm(preview.totalDistanceM)}`
                : `Маршрутизатор недоступен, показаны прямые линии${preview.error ? ` (${preview.error})` : ""}`}
            </span>
          ) : (
            <span>Пунктирная линия — прямые отрезки. Нажмите «Показать путь по дорогам».</span>
          )}
        </p>
      </Card>

      {/* ------------------------------------------------------------ stop list */}
      <Card>
        <SectionTitle>Остановки и время в пути</SectionTitle>

        {value.stops.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Добавьте минимум две остановки на карте выше.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {value.stops.map((s, i) => (
              <li key={`${s.stopId ?? "new"}-${i}`} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>

                <div className="min-w-48 flex-1">
                  {s.stopId ? (
                    <Field label="Остановка">
                      <select
                        className={inputClass}
                        value={s.stopId}
                        onChange={(e) => {
                          const stop = stopOptions.find((o) => o.id === e.target.value);
                          if (!stop) return;
                          const next = [...value.stops];
                          next[i] = { ...s, stopId: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng };
                          setStops(next);
                        }}
                      >
                        {stopOptions
                          .filter((o) => o.id === s.stopId || !usedStopIds.has(o.id))
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  ) : (
                    <Field label="Новая остановка" hint={`${s.lat.toFixed(5)}, ${s.lng.toFixed(5)} · будет создана при сохранении`}>
                      <input
                        className={inputClass}
                        value={s.name}
                        onChange={(e) => {
                          const next = [...value.stops];
                          next[i] = { ...s, name: e.target.value };
                          setStops(next);
                        }}
                      />
                    </Field>
                  )}
                </div>

                <div className="w-32">
                  <Field label="Через, мин">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      value={s.offsetMin}
                      onChange={(e) => {
                        const next = [...value.stops];
                        next[i] = { ...s, offsetMin: Number(e.target.value) };
                        setValue((prev) => ({ ...prev, stops: next }));
                      }}
                    />
                  </Field>
                </div>

                <div className="flex gap-1 pb-0.5">
                  <Button variant="ghost" className="min-h-9 px-2" onClick={() => moveStop(i, -1)} aria-label="Выше">
                    ↑
                  </Button>
                  <Button variant="ghost" className="min-h-9 px-2" onClick={() => moveStop(i, 1)} aria-label="Ниже">
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-9 px-2 text-danger"
                    aria-label="Убрать остановку"
                    onClick={() => setStops(value.stops.filter((_, idx) => idx !== i))}
                  >
                    <IconMinus className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          «Через, мин» — смещение от времени отправления рейса. Первая остановка обычно 0.
        </p>
      </Card>

      {/* ------------------------------------------------------------ schedule */}
      <Card id="schedule" className={suggestedDeparture ? "scroll-mt-4 ring-2 ring-primary" : "scroll-mt-4"}>
        <SectionTitle>Расписание отправлений</SectionTitle>
        {suggestedDeparture && !value.departures.includes(suggestedDeparture) ? (
          <p className="mb-3 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
            Аналитика предлагает добавить отправление {suggestedDeparture}: время уже подставлено ниже, нажмите
            «Добавить время», а затем сохраните маршрут.
          </p>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {value.departures.length === 0 ? (
            <span className="text-sm text-muted-foreground">Отправления не заданы</span>
          ) : (
            [...value.departures].sort().map((t) => (
              <span
                key={t}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted px-3 text-sm font-semibold tabular-nums"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Убрать отправление ${t}`}
                  onClick={() => set("departures", value.departures.filter((d) => d !== t))}
                  className="cursor-pointer text-muted-foreground hover:text-danger"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Field label="Новое отправление">
              <input className={inputClass} type="time" value={newDeparture} onChange={(e) => setNewDeparture(e.target.value)} />
            </Field>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              if (!/^\d{2}:\d{2}$/.test(newDeparture) || value.departures.includes(newDeparture)) return;
              set("departures", [...value.departures, newDeparture].sort());
              setNewDeparture("");
            }}
          >
            Добавить время
          </Button>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">Дни недели</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = value.daysOfWeek.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set(
                      "daysOfWeek",
                      on ? value.daysOfWeek.filter((x) => x !== d.value) : [...value.daysOfWeek, d.value].sort(),
                    )
                  }
                  className={cx(
                    "min-h-10 min-w-12 cursor-pointer rounded-lg border px-3 text-sm font-medium transition-colors",
                    on ? "border-primary bg-primary-soft text-primary" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Дни применяются ко всем отправлениям этого маршрута.</p>
        </div>
      </Card>

      {/* ------------------------------------------------------------ versions */}
      {value.id ? (
        <Card>
          <SectionTitle>Версии маршрута</SectionTitle>
          <div className="mb-4 max-w-md">
            <Field
              label="Что меняете"
              hint="Сохранится вместе с новой версией. Новая версия создаётся только при изменении остановок или времени."
            >
              <input
                className={inputClass}
                value={versionNote}
                onChange={(e) => setVersionNote(e.target.value)}
                placeholder="Например, добавлена остановка «Микрорайон 21»"
              />
            </Field>
          </div>

          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">История пока пуста.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className={cx(
                    "rounded-lg border p-3 text-sm",
                    v.isCurrent ? "border-primary bg-primary-soft/30" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">Версия {v.version}</span>
                    {v.isCurrent ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-on-primary">
                        действует
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">{formatWhen(v.createdAt)}</span>
                    {v.createdByName ? <span className="text-muted-foreground">· {v.createdByName}</span> : null}
                  </div>

                  {v.note ? <p className="mt-1">{v.note}</p> : null}

                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground tabular-nums">
                    <span>остановок {v.stopCount}</span>
                    <span>рейсов {v.tripCount}</span>
                    {v.completedTripCount > 0 ? <span>завершено {v.completedTripCount}</span> : null}
                    {v.pathSource === "road" && v.pathDistanceM ? <span>{formatKm(v.pathDistanceM)} по дорогам</span> : null}
                  </p>

                  {v.stopNames.length ? (
                    <p className="mt-1 text-xs text-muted-foreground">{v.stopNames.join(" → ")}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Старые версии не удаляются: завершённые рейсы остаются привязанными к той форме маршрута, по которой
            фактически ехали, поэтому история загрузки по остановкам не искажается.
          </p>
        </Card>
      ) : null}

      {result?.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}
      {result?.ok && result.message ? (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-green-800">
          {result.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Сохранение…" : value.id ? "Сохранить маршрут" : "Создать маршрут"}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/admin/routes")}>
          К списку
        </Button>
      </div>

      {value.id ? (
        <p className="text-xs text-muted-foreground">
          При изменении остановок или времени пассажиры и водители этого маршрута получат уведомление, а
          запланированные рейсы перейдут на новую версию.
        </p>
      ) : null}
    </div>
  );
}
