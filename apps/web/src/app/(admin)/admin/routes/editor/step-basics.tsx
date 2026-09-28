"use client";

import { Field, cx, inputClass } from "@/components/ui";
import { COLORS } from "./types";
import type { RouteEditor } from "./use-route-editor";

/** Who the route is: its number, its direction and how it looks on a map. */
export function StepBasics({ editor }: { editor: RouteEditor }) {
  const { value, problems } = editor;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Номер маршрута" error={problems.errors.name}>
        <input
          className={inputClass}
          value={value.name}
          onChange={(e) => editor.set("name", e.target.value)}
          placeholder="№5"
        />
      </Field>

      <Field label="Направление" hint="Утро и вечер — два отдельных маршрута с одним номером">
        <select
          className={inputClass}
          value={value.direction}
          onChange={(e) => editor.set("direction", e.target.value as typeof value.direction)}
        >
          <option value="to_work">Утро · на работу</option>
          <option value="from_work">Вечер · домой</option>
        </select>
      </Field>

      <Field
        label="Статус"
        hint={value.status === "active" ? undefined : "Пассажиры не увидят этот маршрут"}
      >
        <select
          className={inputClass}
          value={value.status}
          onChange={(e) => editor.set("status", e.target.value as typeof value.status)}
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
          onChange={(e) => editor.set("description", e.target.value)}
          placeholder="Микрорайоны — Центр — Офис"
        />
      </Field>

      <Field
        label="Плановая вместимость"
        error={problems.errors.plannedCapacity}
        hint="Используется, пока транспорт не назначен"
      >
        <input
          className={inputClass}
          type="number"
          value={value.plannedCapacity}
          onChange={(e) => editor.set("plannedCapacity", e.target.value)}
          placeholder="30"
        />
      </Field>

      <Field label="Цвет на карте" error={problems.errors.color}>
        <div className="flex flex-wrap items-center gap-2 pt-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Цвет ${c}`}
              aria-pressed={value.color === c}
              onClick={() => editor.set("color", c)}
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
  );
}
