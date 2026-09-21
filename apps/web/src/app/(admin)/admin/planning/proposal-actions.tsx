"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, cx } from "@/components/ui";
import { addDeparture, createRouteDraft } from "../actions";

export interface ProposedStopDto {
  stopId: string | null;
  name: string;
  lat: number;
  lng: number;
  offsetMin: number;
}

/** Creates a draft route from the proposal, then opens it in the editor. */
export function CreateRouteDraftButton({
  name,
  description,
  departures,
  stops,
}: {
  name: string;
  description: string;
  departures: string[];
  stops: ProposedStopDto[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await createRouteDraft({ name, description, direction: "to_work", departures, stops });
              setResult(res);
              if (res.ok && res.id) router.push(`/admin/routes/${res.id}`);
            })
          }
        >
          {pending ? "Создаём…" : "Создать черновик маршрута"}
        </Button>
      </div>
      {result?.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Маршрут создаётся как черновик и не виден пассажирам, пока вы не переведёте его в активные.
      </p>
    </div>
  );
}

/** Adds one departure to an existing route. */
export function AddDepartureButton({
  routeId,
  departureTime,
  className,
}: {
  routeId: string;
  departureTime: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);

  if (result?.ok) {
    return <span className="text-xs font-medium text-green-700">{result.message}</span>;
  }

  return (
    <span className={cx("inline-flex flex-col items-start gap-1", className)}>
      <Button
        variant="secondary"
        className="min-h-9 px-3 text-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await addDeparture({ routeId, departureTime });
            setResult(res);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? "…" : `Добавить рейс ${departureTime}`}
      </Button>
      {result?.error ? <span className="text-xs text-danger">{result.error}</span> : null}
    </span>
  );
}
