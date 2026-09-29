"use client";

import { useState } from "react";
import { ActionButton, Collapsible, EntityForm } from "@/components/entity-form";
import { createAdmin, resetAdminPassword, setUserStatus } from "../actions";

export function AdminsEditor() {
  return (
    <Collapsible title="Добавить администратора">
      <EntityForm
        compact
        resetAfterSubmit
        submitLabel="Создать"
        action={createAdmin}
        fields={[
          { name: "name", label: "Имя и фамилия", required: true, placeholder: "Фарход Назаров" },
          { name: "phone", label: "Телефон", type: "tel", required: true, placeholder: "+992900000000" },
          { name: "password", label: "Пароль", type: "password", required: true, hint: "Минимум 6 символов, сообщите администратору" },
        ]}
      />
    </Collapsible>
  );
}

export function AdminRowActions({ id, name, userStatus }: { id: string; name: string; userStatus: "active" | "blocked" }) {
  const [resetting, setResetting] = useState(false);

  if (resetting) {
    return (
      <div className="min-w-80 py-2">
        <EntityForm
          compact
          resetAfterSubmit
          submitLabel="Сменить пароль"
          action={resetAdminPassword}
          hiddenValues={{ id }}
          onDone={() => setResetting(false)}
          fields={[{ name: "password", label: `Новый пароль для ${name}`, type: "password", required: true, hint: "Минимум 6 символов" }]}
        />
        <button
          type="button"
          onClick={() => setResetting(false)}
          className="mt-2 cursor-pointer text-sm text-muted-foreground hover:underline"
        >
          Отмена
        </button>
      </div>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setResetting(true)}
        className="min-h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-muted"
      >
        Сбросить пароль
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
