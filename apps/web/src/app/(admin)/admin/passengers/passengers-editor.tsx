"use client";

import { useState } from "react";
import { ActionButton, Collapsible, EntityForm, type FormField } from "@/components/entity-form";
import { savePassenger, setUserStatus } from "../actions";

function fields(defaults?: Record<string, string | number | null>): FormField[] {
  return [
    { name: "name", label: "Имя и фамилия", required: true, placeholder: "Манижа Рахимова", defaultValue: defaults?.name as string },
    { name: "phone", label: "Телефон", type: "tel", required: true, placeholder: "+992910000001", defaultValue: defaults?.phone as string },
    {
      name: "password",
      label: defaults ? "Новый пароль" : "Пароль",
      type: "password",
      hint: defaults ? "Оставьте пустым, чтобы не менять" : "Минимум 6 символов",
      required: !defaults,
    },
    { name: "department", label: "Отдел", placeholder: "Логистика", defaultValue: defaults?.department as string },
    { name: "homeAddress", label: "Домашний адрес", wide: true, defaultValue: defaults?.homeAddress as string },
    { name: "lat", label: "Широта", type: "number", defaultValue: defaults?.lat as number, hint: "Нужна для поиска ближайшей остановки" },
    { name: "lng", label: "Долгота", type: "number", defaultValue: defaults?.lng as number },
  ];
}

export function PassengersEditor() {
  return (
    <Collapsible title="Добавить пассажира">
      <EntityForm resetAfterSubmit submitLabel="Создать" action={savePassenger} fields={fields()} />
    </Collapsible>
  );
}

export function PassengerRowActions({
  id,
  name,
  phone,
  department,
  homeAddress,
  lat,
  lng,
  status,
}: {
  id: string;
  name: string;
  phone: string;
  department: string;
  homeAddress: string;
  lat: number | null;
  lng: number | null;
  status: "active" | "blocked";
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
          action={() => setUserStatus(id, status === "blocked" ? "active" : "blocked")}
          label={status === "blocked" ? "Разблокировать" : "Заблокировать"}
          variant="ghost"
          className={status === "blocked" ? "" : "text-danger"}
          confirm={status === "blocked" ? undefined : `Заблокировать доступ для ${name}?`}
        />
      </span>
    );
  }

  return (
    <div className="min-w-[32rem] py-2">
      <EntityForm
        submitLabel="Сохранить"
        action={savePassenger}
        hiddenValues={{ id }}
        onDone={() => setEditing(false)}
        fields={fields({ name, phone, department, homeAddress, lat, lng })}
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
