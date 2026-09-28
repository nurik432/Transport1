"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDays, formatLocalDate, routeReadiness, type ReadinessStep } from "@transport/domain";
import { Button, LinkButton, Panel, PanelTitle, cx } from "@/components/ui";
import { IconAlert, IconCheck } from "@/components/icons";
import { generateTrips } from "../../actions";
import type { ReadinessFacts } from "./types";
import type { RouteEditor } from "./use-route-editor";

/**
 * What is still missing before this route carries anybody.
 *
 * Schedules do not create trips, drafts are invisible to passengers, and an
 * unassigned trip never reaches a driver — each of those makes a route look
 * finished while nothing happens. The panel names the one that applies and
 * offers the action that fixes it, trip generation included, so the answer is
 * not on a screen the editor never mentions.
 */

/** Two weeks: far enough to be useful, short enough to redo after a change. */
const HORIZON_DAYS = 13;

export function ReadinessPanel({
  editor,
  facts,
  routeId,
  onGoToStep,
}: {
  editor: RouteEditor;
  facts: ReadinessFacts;
  routeId?: string;
  /** in the wizard, jump to the step that fixes the item */
  onGoToStep?: (step: 0 | 1 | 2 | 3) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { value } = editor;

  const steps = routeReadiness({
    status: value.status,
    stopCount: value.stops.length,
    departureCount: value.departures.length,
    daysOfWeek: value.daysOfWeek,
    plannedTripCount: facts.plannedTripCount,
    unassignedTripCount: facts.unassignedTripCount,
    hasVehicles: facts.hasVehicles,
    dirty: editor.dirty,
  });

  const left = steps.filter((s) => !s.done).length;
  const today = facts.today;
  const until = addDays(today, HORIZON_DAYS);

  function generate() {
    if (!routeId) return;
    setMessage(null);
    start(async () => {
      const res = await generateTrips({ from: today, to: until, routeId });
      setMessage({ ok: res.ok, text: res.error ?? res.message ?? "" });
      if (res.ok) router.refresh();
    });
  }

  function action(step: ReadinessStep) {
    if (step.done) return null;

    switch (step.key) {
      case "stops":
        return onGoToStep ? (
          <Button variant="quiet" size="sm" onClick={() => onGoToStep(1)}>
            К точкам на карте
          </Button>
        ) : (
          <LinkButton href="#stops" variant="quiet" size="sm">
            К остановкам
          </LinkButton>
        );

      case "departures":
        return onGoToStep ? (
          <Button variant="quiet" size="sm" onClick={() => onGoToStep(2)}>
            К расписанию
          </Button>
        ) : (
          <LinkButton href="#schedule" variant="quiet" size="sm">
            К расписанию
          </LinkButton>
        );

      case "trips":
        // Generation reads the database, so it can only run on a saved route
        // whose schedule is actually in there.
        if (!routeId) return null;
        return (
          <Button variant="quiet" size="sm" onClick={generate} disabled={pending || !canGenerate(steps)}>
            {pending ? "Создаём…" : `Сгенерировать рейсы по ${formatLocalDate(until)}`}
          </Button>
        );

      case "crew":
        return facts.hasVehicles ? (
          <LinkButton href={`/admin/trips?date=${today}&filter=unassigned`} variant="quiet" size="sm">
            Назначить
          </LinkButton>
        ) : (
          <LinkButton href="/admin/vehicles" variant="quiet" size="sm">
            К транспорту
          </LinkButton>
        );

      default:
        return null;
    }
  }

  return (
    <Panel tone={left ? "warn" : "plain"} className="flex flex-col gap-3 p-4">
      <PanelTitle>{left ? `Осталось сделать · ${left}` : "Маршрут готов к работе"}</PanelTitle>

      <ol className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              aria-hidden="true"
              className={cx(
                "flex size-5 shrink-0 items-center justify-center rounded-full",
                step.done ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn-foreground",
              )}
            >
              {step.done ? <IconCheck className="size-3.5" /> : <IconAlert className="size-3.5" />}
            </span>

            <span className={cx("text-sm", step.done ? "text-muted-foreground" : "font-medium")}>
              <span className="sr-only">{step.done ? "Готово: " : "Не сделано: "}</span>
              {step.title}
            </span>

            {step.done ? null : (
              <>
                <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">{step.hint}</span>
                {action(step)}
              </>
            )}
          </li>
        ))}
      </ol>

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={cx(
            "rounded-lg px-3 py-2 text-sm",
            message.ok ? "bg-ok-soft text-green-800" : "bg-danger-soft text-red-800",
          )}
        >
          {message.text}
        </p>
      ) : null}

      {routeId && !canGenerate(steps) && !steps.find((s) => s.key === "trips")?.done ? (
        <p className="text-xs text-muted-foreground">
          Рейсы можно сгенерировать, когда расписание сохранено и маршрут активен. Другой период — на{" "}
          <a href="/admin/trips" className="text-primary hover:underline">
            экране рейсов
          </a>
          .
        </p>
      ) : null}
    </Panel>
  );
}

/** Trip generation needs the schedule stored and the route visible. */
function canGenerate(steps: readonly ReadinessStep[]): boolean {
  return ["departures", "saved", "status"].every((key) => steps.find((s) => s.key === key)?.done);
}
