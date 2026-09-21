"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Field, SectionTitle, cx, inputClass } from "@/components/ui";
import { IconMinus, IconPlus } from "@/components/icons";
import { saveRoute } from "../actions";

export interface StopOption {
  id: string;
  name: string;
}

export interface RouteEditorValue {
  id?: string;
  name: string;
  description: string;
  direction: "to_work" | "from_work";
  status: "draft" | "active" | "inactive";
  color: string;
  plannedCapacity: string;
  stops: { stopId: string; offsetMin: number }[];
  departures: string[];
  daysOfWeek: number[];
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

export function RouteEditor({
  initial,
  stopOptions,
}: {
  initial: RouteEditorValue;
  stopOptions: StopOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<RouteEditorValue>(initial);
  const [newDeparture, setNewDeparture] = useState("");
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof RouteEditorValue>(key: K, v: RouteEditorValue[K]) =>
    setValue((prev) => ({ ...prev, [key]: v }));

  function addStop() {
    const used = new Set(value.stops.map((s) => s.stopId));
    const next = stopOptions.find((s) => !used.has(s.id));
    if (!next) return;
    const lastOffset = value.stops.at(-1)?.offsetMin ?? -5;
    set("stops", [...value.stops, { stopId: next.id, offsetMin: lastOffset + 5 }]);
  }

  function moveStop(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= value.stops.length) return;
    const next = [...value.stops];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    set("stops", next);
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
      });
      setResult(res);
      if (res.ok && res.id && !value.id) router.push(`/admin/routes/${res.id}`);
      else if (res.ok) router.refresh();
    });
  }

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

      <Card>
        <SectionTitle
          action={
            <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={addStop}>
              <IconPlus className="size-4" />
              Добавить остановку
            </Button>
          }
        >
          Остановки и время в пути
        </SectionTitle>

        {value.stops.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Добавьте минимум две остановки.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {value.stops.map((s, i) => (
              <li key={`${s.stopId}:${i}`} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-48 flex-1">
                  <Field label="Остановка">
                    <select
                      className={inputClass}
                      value={s.stopId}
                      onChange={(e) => {
                        const next = [...value.stops];
                        next[i] = { ...s, stopId: e.target.value };
                        set("stops", next);
                      }}
                    >
                      {stopOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </Field>
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
                        set("stops", next);
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
                    onClick={() => set("stops", value.stops.filter((_, idx) => idx !== i))}
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

      <Card>
        <SectionTitle>Расписание отправлений</SectionTitle>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {value.departures.length === 0 ? (
            <span className="text-sm text-muted-foreground">Отправления не заданы</span>
          ) : (
            [...value.departures]
              .sort()
              .map((t) => (
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
          После сохранения пассажиры и водители этого маршрута получат уведомление об изменении.
        </p>
      ) : null}
    </div>
  );
}
