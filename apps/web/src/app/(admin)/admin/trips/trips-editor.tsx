"use client";

import { useState, useTransition } from "react";
import { ActionButton, EntityForm } from "@/components/entity-form";
import { Card, SectionTitle, cx, inputClass } from "@/components/ui";
import { assignTrip, cancelTrip, generateTrips } from "../actions";

interface Option {
  value: string;
  label: string;
}

export function GenerateTripsForm({
  routeOptions,
  defaultFrom,
  defaultTo,
}: {
  routeOptions: Option[];
  defaultFrom: string;
  defaultTo: string;
}) {
  return (
    <Card>
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
    </Card>
  );
}

export function TripAssignment({
  tripId,
  vehicleId,
  driverId,
  vehicleOptions,
  driverOptions,
  disabled,
}: {
  tripId: string;
  vehicleId: string;
  driverId: string;
  vehicleOptions: Option[];
  driverOptions: Option[];
  disabled?: boolean;
}) {
  const [vehicle, setVehicle] = useState(vehicleId);
  const [driver, setDriver] = useState(driverId);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save(nextVehicle: string, nextDriver: string) {
    setSaved(false);
    start(async () => {
      await assignTrip(tripId, nextVehicle || null, nextDriver || null);
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={cx(inputClass, "min-h-9 w-44 text-sm")}
        value={vehicle}
        disabled={disabled || pending}
        onChange={(e) => {
          setVehicle(e.target.value);
          save(e.target.value, driver);
        }}
      >
        <option value="">Транспорт не назначен</option>
        {vehicleOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        className={cx(inputClass, "min-h-9 w-40 text-sm")}
        value={driver}
        disabled={disabled || pending}
        onChange={(e) => {
          setDriver(e.target.value);
          save(vehicle, e.target.value);
        }}
      >
        <option value="">Водитель не назначен</option>
        {driverOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {pending ? <span className="text-xs text-muted-foreground">Сохранение…</span> : null}
      {saved && !pending ? <span className="text-xs text-green-700">Сохранено</span> : null}
    </div>
  );
}

export function TripRowActions({ tripId, time, routeName }: { tripId: string; time: string; routeName: string }) {
  return (
    <ActionButton
      action={() => cancelTrip(tripId)}
      label="Отменить рейс"
      variant="ghost"
      className="text-danger"
      confirm={`Отменить рейс ${routeName} в ${time}? Пассажиры и водитель получат уведомление.`}
    />
  );
}
