"use client";

import { useState, useTransition } from "react";
import { Button, Card, cx } from "@/components/ui";
import { IconCheck, IconMinus, IconPlus, IconUsers } from "@/components/icons";
import { departStop, finishTrip, markArrival, setHeadcount, startTrip } from "../../actions";

/** "через 4 мин" / "через 4 ч 27 мин" */
function inMinutes(total: number): string {
  if (total <= 0) return "сейчас";
  if (total < 60) return `через ${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `через ${h} ч` : `через ${h} ч ${m} мин`;
}

export interface PanelStop {
  stopId: string;
  name: string;
  seq: number;
  plannedLabel: string;
  arrivedLabel: string | null;
  departed: boolean;
  arrived: boolean;
  boarded: number;
  alighted: number;
  waiting: number;
  waitingNames: string[];
}

export interface DrivingPanelProps {
  tripId: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  stops: PanelStop[];
  /** minutes from now to the next stop, by stopId */
  minutesTo: Record<string, number>;
}

function Counter({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`${label}: меньше`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex size-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <IconMinus />
        </button>
        <span className="min-w-10 text-center text-3xl font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`${label}: больше`}
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          className="flex size-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <IconPlus />
        </button>
      </div>
    </div>
  );
}

export function DrivingPanel({ tripId, status, stops, minutesTo }: DrivingPanelProps) {
  const [pending, start] = useTransition();

  const atStop = stops.find((s) => s.arrived && !s.departed);
  const nextStop = stops.find((s) => !s.arrived);
  const current = atStop ?? [...stops].reverse().find((s) => s.departed);

  const [boarded, setBoarded] = useState(atStop?.boarded ?? 0);
  const [alighted, setAlighted] = useState(atStop?.alighted ?? 0);
  const [editingStop, setEditingStop] = useState(atStop?.stopId ?? null);

  // Reset counters when the driver moves to another stop.
  if (atStop && atStop.stopId !== editingStop) {
    setEditingStop(atStop.stopId);
    setBoarded(atStop.boarded);
    setAlighted(atStop.alighted);
  }

  if (status === "planned") {
    return (
      <Card className="flex flex-col gap-4 text-center">
        <p className="text-sm text-muted-foreground">Рейс ещё не начат</p>
        <p className="text-lg font-semibold">Первая остановка: {stops[0]?.name}</p>
        <Button
          className="min-h-14 w-full text-base"
          disabled={pending}
          onClick={() => start(() => startTrip(tripId))}
        >
          Начать рейс
        </Button>
      </Card>
    );
  }

  if (status !== "in_progress") {
    const totalBoarded = stops.reduce((s, x) => s + x.boarded, 0);
    return (
      <Card className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-ok-soft text-green-700">
          <IconCheck className="size-6" />
        </span>
        <p className="text-lg font-semibold">Рейс завершён</p>
        <p className="text-sm text-muted-foreground">Всего село пассажиров: {totalBoarded}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Текущая остановка</p>
          <p className="text-2xl font-semibold">{atStop ? atStop.name : (current?.name ?? "—")}</p>
          {!atStop && current ? <p className="text-sm text-muted-foreground">Отправились</p> : null}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">Следующая остановка</p>
          <p className="text-2xl font-semibold text-primary">{nextStop ? nextStop.name : "Конечная"}</p>
          {nextStop ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {minutesTo[nextStop.stopId] !== undefined && minutesTo[nextStop.stopId]! > 0
                ? `${inMinutes(minutesTo[nextStop.stopId]!)} · по плану ${nextStop.plannedLabel}`
                : `По плану ${nextStop.plannedLabel}`}
              {nextStop.waiting > 0 ? ` · ожидают ${nextStop.waiting}` : ""}
            </p>
          ) : null}
        </div>
      </Card>

      {atStop ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Пассажиры на остановке «{atStop.name}»</p>
            {atStop.waiting > 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-1 text-xs font-medium text-primary tabular-nums">
                <IconUsers className="size-3.5" />
                ждут {atStop.waiting}
              </span>
            ) : null}
          </div>

          {atStop.waitingNames.length ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">Список ожидающих</summary>
              <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                {atStop.waitingNames.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="flex gap-4">
            <Counter label="Сели" value={boarded} onChange={setBoarded} disabled={pending} />
            <Counter label="Вышли" value={alighted} onChange={setAlighted} disabled={pending} />
          </div>

          <Button
            className="min-h-14 w-full text-base"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setHeadcount(tripId, atStop.stopId, boarded, alighted);
                await departStop(tripId, atStop.stopId);
              })
            }
          >
            Отправиться дальше
          </Button>
        </Card>
      ) : nextStop ? (
        <Button
          className="min-h-16 w-full text-lg"
          disabled={pending}
          onClick={() => start(() => markArrival(tripId, nextStop.stopId))}
        >
          Прибыл на «{nextStop.name}»
        </Button>
      ) : null}

      {!nextStop ? (
        <Button
          variant="secondary"
          className="min-h-14 w-full text-base"
          disabled={pending}
          onClick={() => start(() => finishTrip(tripId))}
        >
          Завершить рейс
        </Button>
      ) : (
        <Button
          variant="ghost"
          className={cx("w-full text-sm")}
          disabled={pending}
          onClick={() => start(() => finishTrip(tripId))}
        >
          Завершить рейс досрочно
        </Button>
      )}
    </div>
  );
}
