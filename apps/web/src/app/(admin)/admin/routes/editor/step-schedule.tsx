"use client";

import { useState } from "react";
import { MAX_VEHICLES_PER_DEPARTURE, plural, type RouteDeparture } from "@transport/domain";
import { Button, Field, cx, inputClass } from "@/components/ui";
import { WEEKDAYS } from "./types";
import type { RouteEditor } from "./use-route-editor";

const vehiclesLabel = (n: number) => `${n} ${plural(n, ["машина", "машины", "машин"])}`;

/**
 * When the route runs. A departure with no weekday never becomes a trip, which
 * is why the weekdays are part of this step and not an afterthought.
 *
 * A busy time can take several vehicles. Each is its own trip with its own
 * driver; passengers pick which one they ride.
 */
export function StepSchedule({
  editor,
  suggestedDeparture = null,
}: {
  editor: RouteEditor;
  /** proposed by the analysis screen, pre-filled in the field */
  suggestedDeparture?: string | null;
}) {
  const { value, problems } = editor;
  const [newDeparture, setNewDeparture] = useState(suggestedDeparture ?? "");
  const [error, setError] = useState<string | null>(null);

  function add() {
    if (!/^\d{2}:\d{2}$/.test(newDeparture)) {
      setError("Укажите время в формате ЧЧ:ММ");
      return;
    }
    if (value.departures.some((d) => d.time === newDeparture)) {
      setError(`Отправление ${newDeparture} уже добавлено`);
      return;
    }
    editor.set(
      "departures",
      [...value.departures, { time: newDeparture, vehicles: 1 }].sort((a, b) => a.time.localeCompare(b.time)),
    );
    setNewDeparture("");
    setError(null);
  }

  function setVehicles(time: string, vehicles: number) {
    editor.set(
      "departures",
      value.departures.map((d) => (d.time === time ? { ...d, vehicles } : d)),
    );
  }

  const sorted: RouteDeparture[] = [...value.departures].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="flex flex-col gap-4">
      {suggestedDeparture && !value.departures.some((d) => d.time === suggestedDeparture) ? (
        <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
          Аналитика предлагает добавить отправление {suggestedDeparture}: время уже подставлено ниже, нажмите
          «Добавить время», а затем сохраните маршрут.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {sorted.length === 0 ? (
          <span className="text-sm text-muted-foreground">Отправления не заданы</span>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map(({ time: t, vehicles }) => (
              <li
                key={t}
                className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted px-3 py-1.5"
              >
                <span className="w-14 text-base font-bold tabular-nums">{t}</span>
                <span className="flex items-center gap-1" role="group" aria-label={`Машин в ${t}`}>
                  <button
                    type="button"
                    aria-label={`Меньше машин в ${t}`}
                    disabled={vehicles <= 1}
                    onClick={() => setVehicles(t, vehicles - 1)}
                    className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-lg font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-20 text-center text-sm font-semibold" aria-live="polite">
                    {vehiclesLabel(vehicles)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Больше машин в ${t}`}
                    disabled={vehicles >= MAX_VEHICLES_PER_DEPARTURE}
                    onClick={() => setVehicles(t, vehicles + 1)}
                    className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-lg font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +
                  </button>
                </span>
                <button
                  type="button"
                  aria-label={`Убрать отправление ${t}`}
                  onClick={() =>
                    editor.set(
                      "departures",
                      value.departures.filter((d) => d.time !== t),
                    )
                  }
                  className="ml-auto min-h-9 cursor-pointer px-2 text-sm text-muted-foreground hover:text-danger"
                >
                  Убрать
                </button>
              </li>
            ))}
          </ul>
        )}
        {sorted.some((d) => d.vehicles > 1) ? (
          <p className="text-xs text-muted-foreground">
            Каждая машина — отдельный рейс: транспорт и водителя назначьте в «Рейсах». Пассажир выбирает машину сам.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Field label="Новое отправление" error={error ?? undefined}>
            <input
              className={inputClass}
              type="time"
              value={newDeparture}
              onChange={(e) => {
                setNewDeparture(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
          </Field>
        </div>
        <Button variant="secondary" onClick={add}>
          Добавить время
        </Button>
      </div>

      <div>
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
                  editor.set(
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
        {problems.errors.daysOfWeek ? (
          <p className="mt-2 text-xs font-medium text-danger">{problems.errors.daysOfWeek}</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Дни применяются ко всем отправлениям этого маршрута.</p>
        )}
      </div>
    </div>
  );
}
