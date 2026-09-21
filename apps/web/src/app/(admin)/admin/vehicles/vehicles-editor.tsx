"use client";

import { useState } from "react";
import { ActionButton, Collapsible, EntityForm } from "@/components/entity-form";
import { deleteVehicle, saveVehicle } from "../actions";

const STATUS_OPTIONS = [
  { value: "active", label: "В работе" },
  { value: "repair", label: "На ремонте" },
  { value: "inactive", label: "Отключён" },
];

const FIELDS = (defaults?: { number: string; model: string; capacity: number; status: string }) => [
  { name: "number", label: "Гос. номер", required: true, placeholder: "01 A 123 AA", defaultValue: defaults?.number },
  { name: "model", label: "Модель", required: true, placeholder: "Автобус ПАЗ-4234", defaultValue: defaults?.model },
  { name: "capacity", label: "Мест", type: "number" as const, required: true, placeholder: "30", defaultValue: defaults?.capacity },
  {
    name: "status",
    label: "Статус",
    type: "select" as const,
    options: STATUS_OPTIONS,
    required: true,
    defaultValue: defaults?.status ?? "active",
  },
];

export function VehiclesEditor() {
  return (
    <Collapsible title="Добавить транспорт">
      <EntityForm compact resetAfterSubmit submitLabel="Добавить" action={saveVehicle} fields={FIELDS()} />
    </Collapsible>
  );
}

export function VehicleRowActions({
  id,
  number,
  model,
  capacity,
  status,
}: {
  id: string;
  number: string;
  model: string;
  capacity: number;
  status: "active" | "repair" | "inactive";
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-muted"
        >
          Изменить
        </button>
        <ActionButton
          action={() => deleteVehicle(id)}
          label="Удалить"
          variant="ghost"
          className="text-danger"
          confirm={`Удалить транспорт ${number}?`}
        />
      </span>
    );
  }

  return (
    <div className="min-w-80 py-2">
      <EntityForm
        compact
        submitLabel="Сохранить"
        action={saveVehicle}
        hiddenValues={{ id }}
        onDone={() => setEditing(false)}
        fields={FIELDS({ number, model, capacity, status })}
      />
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="mt-2 cursor-pointer text-sm text-muted-foreground hover:underline"
      >
        Отмена
      </button>
    </div>
  );
}
