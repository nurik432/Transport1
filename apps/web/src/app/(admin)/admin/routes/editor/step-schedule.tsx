"use client";

import { useState } from "react";
import { Button, Field, cx, inputClass } from "@/components/ui";
import { WEEKDAYS } from "./types";
import type { RouteEditor } from "./use-route-editor";

/**
 * When the route runs. A departure with no weekday never becomes a trip, which
 * is why the weekdays are part of this step and not an afterthought.
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
    if (value.departures.includes(newDeparture)) {
      setError(`Отправление ${newDeparture} уже добавлено`);
      return;
    }
    editor.set("departures", [...value.departures, newDeparture].sort());
    setNewDeparture("");
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {suggestedDeparture && !value.departures.includes(suggestedDeparture) ? (
        <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
          Аналитика предлагает добавить отправление {suggestedDeparture}: время уже подставлено ниже, нажмите
          «Добавить время», а затем сохраните маршрут.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
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
                onClick={() =>
                  editor.set(
                    "departures",
                    value.departures.filter((d) => d !== t),
                  )
                }
                className="cursor-pointer text-muted-foreground hover:text-danger"
              >
                ×
              </button>
            </span>
          ))
        )}
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
