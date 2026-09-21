"use client";

import { useState } from "react";
import { ActionButton, Collapsible, EntityForm } from "@/components/entity-form";
import { deleteStop, saveStop } from "../actions";

const STATUS_OPTIONS = [
  { value: "active", label: "Активна" },
  { value: "inactive", label: "Отключена" },
];

export function NewStopForm() {
  return (
    <Collapsible title="Добавить остановку">
      <EntityForm
        compact
        resetAfterSubmit
        submitLabel="Создать остановку"
        action={saveStop}
        fields={[
          { name: "name", label: "Название", required: true, placeholder: "Панчшанбе", wide: true },
          { name: "address", label: "Адрес", placeholder: "пл. Панчшанбе", wide: true },
          { name: "lat", label: "Широта", type: "number", required: true, placeholder: "40.2870", hint: "Координаты Худжанда: 40.28, 69.63" },
          { name: "lng", label: "Долгота", type: "number", required: true, placeholder: "69.6265" },
          { name: "status", label: "Статус", type: "select", options: STATUS_OPTIONS, required: true, defaultValue: "active" },
        ]}
      />
    </Collapsible>
  );
}

export function StopsEditor() {
  return (
    <div className="flex flex-col gap-3">
      <NewStopForm />
      <p className="text-xs text-muted-foreground">
        Остановку, которая уже используется в маршруте, удалить нельзя — переведите её в неактивные.
      </p>
    </div>
  );
}

export function StopRowActions({
  id,
  name,
  lat,
  lng,
  address,
  status,
}: {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  status: "active" | "inactive";
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
          action={() => deleteStop(id)}
          label="Удалить"
          variant="ghost"
          className="text-danger"
          confirm={`Удалить остановку «${name}»?`}
        />
      </span>
    );
  }

  return (
    <div className="min-w-80 py-2">
      <EntityForm
        compact
        submitLabel="Сохранить"
        action={saveStop}
        hiddenValues={{ id }}
        onDone={() => setEditing(false)}
        fields={[
          { name: "name", label: "Название", required: true, defaultValue: name, wide: true },
          { name: "address", label: "Адрес", defaultValue: address, wide: true },
          { name: "lat", label: "Широта", type: "number", required: true, defaultValue: lat },
          { name: "lng", label: "Долгота", type: "number", required: true, defaultValue: lng },
          { name: "status", label: "Статус", type: "select", options: STATUS_OPTIONS, required: true, defaultValue: status },
        ]}
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
