"use client";

import { useState } from "react";
import { ActionButton, Collapsible, EntityForm, type FormField } from "@/components/entity-form";
import { saveDriver, setUserStatus } from "../actions";

interface Option {
  value: string;
  label: string;
}

const DRIVER_STATUS = [
  { value: "active", label: "Активен" },
  { value: "inactive", label: "Не работает" },
];

function fields(vehicleOptions: Option[], defaults?: Partial<Record<string, string>>): FormField[] {
  return [
    { name: "name", label: "Имя и фамилия", required: true, placeholder: "Рустам Каримов", defaultValue: defaults?.name },
    { name: "phone", label: "Телефон", type: "tel", required: true, placeholder: "+992900000101", defaultValue: defaults?.phone },
    {
      name: "password",
      label: defaults ? "Новый пароль" : "Пароль",
      type: "password",
      hint: defaults ? "Оставьте пустым, чтобы не менять" : "Минимум 6 символов, сообщите водителю",
      required: !defaults,
    },
    { name: "vehicleId", label: "Транспорт", type: "select", options: vehicleOptions, defaultValue: defaults?.vehicleId },
    {
      name: "driverStatus",
      label: "Статус водителя",
      type: "select",
      options: DRIVER_STATUS,
      required: true,
      defaultValue: defaults?.driverStatus ?? "active",
    },
  ];
}

export function DriversEditor({ vehicleOptions }: { vehicleOptions: Option[] }) {
  return (
    <Collapsible title="Добавить водителя">
      <EntityForm compact resetAfterSubmit submitLabel="Создать" action={saveDriver} fields={fields(vehicleOptions)} />
    </Collapsible>
  );
}

export function DriverRowActions({
  id,
  name,
  phone,
  vehicleId,
  driverStatus,
  userStatus,
  vehicleOptions,
}: {
  id: string;
  name: string;
  phone: string;
  vehicleId: string;
  driverStatus: "active" | "inactive";
  userStatus: "active" | "blocked";
  vehicleOptions: Option[];
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
          action={() => setUserStatus(id, userStatus === "blocked" ? "active" : "blocked")}
          label={userStatus === "blocked" ? "Разблокировать" : "Заблокировать"}
          variant="ghost"
          className={userStatus === "blocked" ? "" : "text-danger"}
          confirm={userStatus === "blocked" ? undefined : `Заблокировать доступ для ${name}?`}
        />
      </span>
    );
  }

  return (
    <div className="min-w-96 py-2">
      <EntityForm
        compact
        submitLabel="Сохранить"
        action={saveDriver}
        hiddenValues={{ id }}
        onDone={() => setEditing(false)}
        fields={fields(vehicleOptions, { name, phone, vehicleId, driverStatus })}
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
