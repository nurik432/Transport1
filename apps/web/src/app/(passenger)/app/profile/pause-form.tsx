"use client";

import { useState, useTransition } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { pauseRides, resumeRides, type RideActionResult } from "../actions";

/** "I am away from … to …": holiday or sick leave without detaching from the departures. */
export function PauseForm({
  from,
  to,
  today,
  active,
}: {
  /** current pause, empty strings when there is none */
  from: string;
  to: string;
  today: string;
  /** a pause is set and has not ended yet */
  active: boolean;
}) {
  const [start, setStart] = useState(from || today);
  const [end, setEnd] = useState(to);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();

  const submit = (action: () => Promise<RideActionResult>) =>
    run(async () => {
      const result = await action();
      setError(result.ok ? null : (result.error ?? "Не удалось сохранить"));
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Не езжу с">
          <input
            type="date"
            className={inputClass}
            value={start}
            min={today}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="по">
          <input
            type="date"
            className={inputClass}
            value={end}
            min={start || today}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={pending} onClick={() => submit(() => pauseRides(start, end))}>
          {active ? "Изменить паузу" : "Поставить на паузу"}
        </Button>
        {active ? (
          <Button variant="secondary" disabled={pending} onClick={() => submit(resumeRides)}>
            Снять паузу
          </Button>
        ) : null}
      </div>
    </div>
  );
}
