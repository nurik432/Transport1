"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { ActionButton, type FormResult } from "@/components/entity-form";
import { Button, Field, inputClass } from "@/components/ui";
import { adminSubscribe, adminUnsubscribe } from "../actions";

type Direction = "to_work" | "from_work";

/** A route a passenger can be attached to: its departures and the stops they can board at. */
export interface RideRouteOption {
  id: string;
  name: string;
  direction: Direction;
  departures: { scheduleId: string; time: string }[];
  stops: { id: string; name: string }[];
}

export interface PassengerRide {
  id: string;
  scheduleId: string;
  direction: Direction;
  routeName: string;
  departureTime: string;
  stopName: string;
}

/**
 * The same list of routes serves every row of the table, so it travels once
 * through context instead of being repeated in each row's props.
 */
const RideOptionsContext = createContext<RideRouteOption[]>([]);

export function RideOptionsProvider({ routes, children }: { routes: RideRouteOption[]; children: React.ReactNode }) {
  return <RideOptionsContext.Provider value={routes}>{children}</RideOptionsContext.Provider>;
}

const DIRECTION_LABEL: Record<Direction, string> = { to_work: "Утро, на работу", from_work: "Вечер, домой" };

function DirectionRides({
  passengerId,
  direction,
  current,
}: {
  passengerId: string;
  direction: Direction;
  current: PassengerRide | undefined;
}) {
  const routes = useContext(RideOptionsContext).filter((r) => r.direction === direction && r.departures.length > 0);
  const [scheduleId, setScheduleId] = useState("");
  const [stopId, setStopId] = useState("");
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, start] = useTransition();

  const route = routes.find((r) => r.departures.some((d) => d.scheduleId === scheduleId));

  function attach() {
    setResult(null);
    start(async () => {
      const res = await adminSubscribe({ passengerId, scheduleId, stopId });
      setResult(res);
      if (res.ok) {
        setScheduleId("");
        setStopId("");
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-muted-foreground">{DIRECTION_LABEL[direction]}</p>
          <p className="truncate text-sm font-medium">
            {current ? `${current.routeName} в ${current.departureTime} · ${current.stopName}` : "Не привязан"}
          </p>
        </div>
        {current ? (
          <ActionButton
            action={() => adminUnsubscribe(current.id)}
            label="Отвязать"
            className="text-danger"
            confirm={`Снять привязку к рейсу ${current.departureTime}? Будущие записи пассажира на этот рейс удалятся.`}
          />
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={current ? "Перевести на рейс" : "Рейс"}>
          <select
            className={inputClass}
            value={scheduleId}
            onChange={(e) => {
              setScheduleId(e.target.value);
              setStopId("");
            }}
          >
            <option value="">— не выбрано —</option>
            {routes.map((r) => (
              <optgroup key={r.id} label={`Маршрут ${r.name}`}>
                {r.departures.map((d) => (
                  <option key={d.scheduleId} value={d.scheduleId}>
                    {r.name} · {d.time}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Остановка посадки">
          <select className={inputClass} value={stopId} disabled={!route} onChange={(e) => setStopId(e.target.value)}>
            <option value="">{route ? "— не выбрано —" : "Сначала выберите рейс"}</option>
            {route?.stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

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

      <div>
        <Button onClick={attach} disabled={pending || !scheduleId || !stopId}>
          {pending ? "Сохранение…" : "Привязать"}
        </Button>
      </div>
    </section>
  );
}

/** Standing bookings of one passenger: one slot for the morning, one for the evening. */
export function RidesPanel({ passengerId, rides }: { passengerId: string; rides: PassengerRide[] }) {
  return (
    <div className="flex flex-col gap-3">
      {(["to_work", "from_work"] as const).map((direction) => (
        <DirectionRides
          key={direction}
          passengerId={passengerId}
          direction={direction}
          current={rides.find((r) => r.direction === direction)}
        />
      ))}
    </div>
  );
}
