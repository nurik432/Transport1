"use client";

import { useState, useTransition } from "react";
import { ActionButton, EntityForm } from "@/components/entity-form";
import { Button, SectionTitle, cx, inputClass } from "@/components/ui";
import { assignTrip, cancelTrip, generateTrips } from "../actions";

interface Option {
  value: string;
  label: string;
}

/**
 * Generating the day from the timetable is a once-a-day action, so it lives
 * behind the header button instead of taking a panel of its own above the list.
 */
export function GenerateTripsForm({
  routeOptions,
  defaultFrom,
  defaultTo,
}: {
  routeOptions: Option[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Создать из расписания
      </Button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-[--radius-panel] border border-border bg-card p-4 shadow-lg">
          <SectionTitle>Генерация рейсов из расписания</SectionTitle>
          <EntityForm
            compact
            submitLabel="Сгенерировать"
            action={generateTrips}
            fields={[
              { name: "from", label: "С даты", type: "date", required: true, defaultValue: defaultFrom },
              { name: "to", label: "По дату", type: "date", required: true, defaultValue: defaultTo },
              {
                name: "routeId",
                label: "Маршрут",
                type: "select",
                options: routeOptions,
                hint: "Пусто — все активные маршруты",
                wide: true,
              },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Транспорт и водитель подставляются из последнего рейса маршрута. Существующие рейсы не дублируются.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Vehicle and driver of one trip, edited inside the row.
 *
 * A trip that is already crewed reads as a line of text — that is the normal
 * case and the eye should slide past it. A trip that is missing someone shows
 * the two fields open and framed, because the row exists to be finished.
 */
export function TripAssignment({
  tripId,
  vehicleId,
  driverId,
  vehicleLabel,
  driverLabel,
  vehicleOptions,
  driverOptions,
  disabled,
}: {
  tripId: string;
  vehicleId: string;
  driverId: string;
  vehicleLabel: string | null;
  driverLabel: string | null;
  vehicleOptions: Option[];
  driverOptions: Option[];
  disabled?: boolean;
}) {
  const [vehicle, setVehicle] = useState(vehicleId);
  const [driver, setDriver] = useState(driverId);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const complete = Boolean(vehicle && driver);

  function save(nextVehicle: string, nextDriver: string) {
    setSaved(false);
    start(async () => {
      await assignTrip(tripId, nextVehicle || null, nextDriver || null);
      setSaved(true);
    });
  }

  if (complete && !editing) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="whitespace-nowrap">
          {vehicleLabel ?? "—"} <span className="text-muted-foreground">·</span> {driverLabel ?? "—"}
        </span>
        {disabled ? null : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="cursor-pointer text-[13px] font-semibold text-primary hover:underline"
          >
            Изменить
          </button>
        )}
        {saved && !pending ? <span className="text-xs text-ok">Сохранено</span> : null}
      </span>
    );
  }

  const fieldClass = cx(
    inputClass,
    "min-h-9 text-[13px]",
    complete ? "" : "border-warn-border",
  );

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className={cx("flex flex-col text-[11px] font-bold", complete ? "text-muted-foreground" : "text-warn-foreground")}>
        Транспорт
        <select
          className={cx(fieldClass, "mt-0.5 w-40")}
          value={vehicle}
          disabled={disabled || pending}
          onChange={(e) => {
            setVehicle(e.target.value);
            save(e.target.value, driver);
          }}
        >
          <option value="">Выбрать…</option>
          {vehicleOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className={cx("flex flex-col text-[11px] font-bold", complete ? "text-muted-foreground" : "text-warn-foreground")}>
        Водитель
        <select
          className={cx(fieldClass, "mt-0.5 w-40")}
          value={driver}
          disabled={disabled || pending}
          onChange={(e) => {
            setDriver(e.target.value);
            save(vehicle, e.target.value);
          }}
        >
          <option value="">Выбрать…</option>
          {driverOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {pending ? <span className="pb-2 text-xs text-muted-foreground">Сохранение…</span> : null}
      {saved && !pending ? <span className="pb-2 text-xs text-ok">Сохранено</span> : null}
    </div>
  );
}

export function TripRowActions({ tripId, time, routeName }: { tripId: string; time: string; routeName: string }) {
  return (
    <ActionButton
      action={() => cancelTrip(tripId)}
      label="Отменить"
      variant="ghost"
      className="text-danger"
      confirm={`Отменить рейс ${routeName} в ${time}? Пассажиры и водитель получат уведомление.`}
    />
  );
}
