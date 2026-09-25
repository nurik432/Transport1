"use client";

import { useTransition } from "react";
import { plural } from "@transport/domain";
import { cx } from "@/components/ui";
import { IconBus } from "@/components/icons";
import { startTrip } from "../../actions";
import { GpsCheck } from "./gps-check";

export interface StartStop {
  stopId: string;
  name: string;
  plannedLabel: string;
  waiting: number;
}

/**
 * The minute before departure: is the phone ready, is the right bus assigned,
 * and who is waiting where. One button at the bottom, nothing else to decide.
 */
export function BeforeStart({
  tripId,
  vehicleLabel,
  capacity,
  booked,
  stops,
}: {
  tripId: string;
  vehicleLabel: string | null;
  capacity: number | null;
  booked: number;
  stops: StartStop[];
}) {
  const [pending, start] = useTransition();

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-3.5 pb-4">
        <section aria-label="Проверка перед выездом" className="flex flex-col rounded-2xl bg-card">
          <GpsCheck />
          <div className="flex min-h-14 items-center gap-3 px-3.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <IconBus className="size-4.5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-semibold">{vehicleLabel ?? "Транспорт не назначен"}</span>
              <span className="text-[13px] text-muted-foreground">
                {capacity ? `${capacity} ${plural(capacity, ["место", "места", "мест"])} · ` : ""}
                записались {booked}
              </span>
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="mx-1 text-[15px] font-bold">Остановки</h2>
          <ol className="flex flex-col rounded-2xl bg-card px-3.5 py-1.5">
            {stops.map((s, i) => (
              <li
                key={s.stopId}
                className="grid min-h-12 grid-cols-[24px_1fr_auto_auto] items-center gap-x-3 border-b border-divider last:border-b-0"
              >
                <span className="text-center text-[13px] font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                <span className={cx("truncate text-[15px]", i === stops.length - 1 ? "font-bold" : "font-semibold")}>
                  {s.name}
                </span>
                {s.waiting > 0 ? (
                  <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[13px] font-bold text-primary tabular-nums">
                    ждут {s.waiting}
                  </span>
                ) : (
                  <span />
                )}
                <span
                  className={cx(
                    "min-w-11 text-right text-[15px] tabular-nums",
                    i === stops.length - 1 ? "font-bold" : "font-semibold",
                  )}
                >
                  {s.plannedLabel}
                </span>
              </li>
            ))}
          </ol>
        </section>

      </main>

      {/* The start button owns the bottom of the screen, not a place in the flow. */}
      <div className="sticky bottom-0 border-t border-border bg-card px-4 pt-3 pb-6">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => startTrip(tripId))}
          className="flex min-h-16 w-full cursor-pointer items-center justify-center rounded-2xl bg-primary text-[19px] font-extrabold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Начинаем…" : "Начать рейс"}
        </button>
      </div>
    </>
  );
}
