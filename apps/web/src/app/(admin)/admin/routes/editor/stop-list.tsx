"use client";

import { useId, useState } from "react";
import { Button, Field, cx, inputClass } from "@/components/ui";
import { IconDrag, IconMinus } from "@/components/icons";
import { useSortable } from "@/components/sortable-list";
import type { RouteEditor } from "./use-route-editor";

/**
 * The stops of the route, in the order they are driven.
 *
 * Order can be changed by dragging the handle or with the up/down buttons. The
 * buttons are not a leftover: they are the only way to do this from a keyboard,
 * and the only way at all on a touch screen.
 */
export function StopList({ editor }: { editor: RouteEditor }) {
  const hintId = useId();
  const [announcement, setAnnouncement] = useState("");
  const { value, problems } = editor;

  function move(from: number, to: number) {
    const point = value.stops[from];
    editor.reorder(from, to);
    if (point) setAnnouncement(`${point.name} — ${to + 1} из ${value.stops.length}`);
  }

  const sortable = useSortable(move);

  if (value.stops.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Пока ни одной точки. Найдите место по названию или нажмите на карту выше.
      </p>
    );
  }

  return (
    <>
      <p id={hintId} className="mb-2 text-xs text-muted-foreground">
        Порядок задаёт направление движения. Меняйте его перетаскиванием за ручку слева или стрелками ↑↓.
      </p>

      <ol aria-describedby={hintId} className="flex flex-col gap-2">
        {value.stops.map((s, i) => {
          const offsetError = problems.errors[`stops.${i}.offsetMin`];
          const offsetWarning = problems.warnings[`stops.${i}.offsetMin`];
          const nameError = problems.errors[`stops.${i}.name`];
          const duplicate = problems.errors[`stops.${i}.stopId`];

          return (
            <li
              key={s.uid}
              {...sortable.rowProps(i)}
              className={cx(
                "flex flex-wrap items-end gap-2 rounded-lg border p-2 transition-colors",
                sortable.overIndex === i && sortable.dragIndex !== i
                  ? "border-primary border-t-2"
                  : "border-border",
                sortable.dragIndex === i && "opacity-50",
              )}
            >
              <span
                {...sortable.handleProps(i)}
                aria-hidden="true"
                title="Перетащите, чтобы изменить порядок"
                className="flex cursor-grab items-center self-center text-muted-foreground active:cursor-grabbing"
              >
                <IconDrag className="size-5" />
              </span>

              <span className="flex size-8 shrink-0 items-center justify-center self-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                {i + 1}
              </span>

              <div className="min-w-48 flex-1">
                {s.stopId ? (
                  <Field label="Остановка" error={duplicate}>
                    <select
                      className={inputClass}
                      value={s.stopId}
                      onChange={(e) => editor.replaceStop(i, e.target.value)}
                    >
                      {editor.stopOptions
                        .filter((o) => o.id === s.stopId || !editor.usedStopIds.has(o.id))
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                ) : (
                  <Field
                    label="Новая остановка"
                    error={nameError}
                    hint={`${s.lat.toFixed(5)}, ${s.lng.toFixed(5)} · будет создана при сохранении`}
                  >
                    <input
                      className={inputClass}
                      value={s.name}
                      onChange={(e) => editor.renamePoint(i, e.target.value)}
                    />
                  </Field>
                )}
              </div>

              <div className="w-36">
                <Field
                  label="Через, мин"
                  error={offsetError}
                  hint={offsetError ? undefined : (offsetWarning ?? (s.offsetManual ? "задано вручную" : undefined))}
                >
                  <input
                    className={cx(inputClass, offsetWarning && !offsetError && "border-warn-border")}
                    type="number"
                    min={0}
                    value={s.offsetMin}
                    onChange={(e) => editor.setOffset(i, Number(e.target.value))}
                  />
                </Field>
                {s.offsetManual ? (
                  <button
                    type="button"
                    onClick={() => editor.clearManualOffset(i)}
                    className="mt-1 cursor-pointer text-xs text-primary hover:underline"
                  >
                    Вернуть расчётное
                  </button>
                ) : null}
              </div>

              <div className="flex gap-1 self-center pb-0.5">
                <Button
                  variant="ghost"
                  className="min-h-9 px-2"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  aria-label={`Переместить «${s.name}» выше`}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-9 px-2"
                  disabled={i === value.stops.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label={`Переместить «${s.name}» ниже`}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-9 px-2 text-danger"
                  aria-label={`Убрать «${s.name}» из маршрута`}
                  onClick={() => editor.removePoint(i)}
                >
                  <IconMinus className="size-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      <p className="mt-3 text-xs text-muted-foreground">
        «Через, мин» — смещение от времени отправления рейса. Первая остановка обычно 0.
      </p>
    </>
  );
}
