"use client";

import { useState, useTransition } from "react";
import { ActionButton, EntityForm } from "@/components/entity-form";
import { Button, SectionTitle, cx, inputClass } from "@/components/ui";
import { assignDeparture, assignTrip, cancelTrip, generateTrips } from "../actions";

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
            Транспорт и водитель берутся из расписания маршрута, а если там не заданы — из последнего рейса.
            Существующие рейсы не дублируются.
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
  departure = null,
}: {
  tripId: string;
  vehicleId: string;
  driverId: string;
  vehicleLabel: string | null;
  driverLabel: string | null;
  vehicleOptions: Option[];
  driverOptions: Option[];
  disabled?: boolean;
  /**
   * "07:30" when the trip is a planned one made from the timetable: then the
   * crew can be pinned to the departure and its following trips at once.
   */
  departure?: string | null;
}) {
  const [vehicle, setVehicle] = useState(vehicleId);
  const [driver, setDriver] = useState(driverId);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const complete = Boolean(vehicle && driver);

  function applyToDeparture() {
    setSaved(false);
    setError(null);
    setBulkMessage(null);
    start(async () => {
      const res = await assignDeparture(tripId, vehicle || null, driver || null);
      if (res.ok) setBulkMessage(res.message ?? "Сохранено");
      else setError(res.error ?? "Не удалось назначить на отправление");
    });
  }

  function save(nextVehicle: string, nextDriver: string) {
    const before = { vehicle, driver };
    setSaved(false);
    setError(null);
    setBulkMessage(null);
    start(async () => {
      const res = await assignTrip(tripId, nextVehicle || null, nextDriver || null);
      if (res.ok) {
        setSaved(true);
        return;
      }
      // The server refused (e.g. the driver already drives another bus at this
      // time): put the selects back so the screen shows what is stored.
      setVehicle(before.vehicle);
      setDriver(before.driver);
      setError(res.error ?? "Не удалось сохранить назначение");
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
        {/* Offered right after a change, so a new crew can be carried forward
            without turning every crewed row into a link. */}
        {departure && !disabled && (saved || bulkMessage) ? (
          <button
            type="button"
            disabled={pending}
            onClick={applyToDeparture}
            className="cursor-pointer text-[13px] font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            На все следующие в {departure}
          </button>
        ) : null}
        {pending ? <span className="text-xs text-muted-foreground">Сохранение…</span> : null}
        {saved && !pending ? <span className="text-xs text-ok">Сохранено</span> : null}
        {bulkMessage && !pending ? (
          <span role="status" className="basis-full text-xs text-ok">
            {bulkMessage}
          </span>
        ) : null}
        {error && !pending ? (
          <span role="alert" className="basis-full text-xs font-medium text-danger">
            {error}
          </span>
        ) : null}
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
      {departure && !disabled && (vehicle || driver) ? (
        <button
          type="button"
          disabled={pending}
          onClick={applyToDeparture}
          className="min-h-9 cursor-pointer pb-2 text-[13px] font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          На все следующие рейсы в {departure}
        </button>
      ) : null}
      {pending ? <span className="pb-2 text-xs text-muted-foreground">Сохранение…</span> : null}
      {saved && !pending ? <span className="pb-2 text-xs text-ok">Сохранено</span> : null}
      {bulkMessage && !pending ? (
        <span role="status" className="basis-full text-xs text-ok">
          {bulkMessage}
        </span>
      ) : null}
      {error && !pending ? (
        <span role="alert" className="basis-full text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
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
