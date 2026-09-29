"use client";

import { EntityForm } from "@/components/entity-form";
import { Card, SectionTitle } from "@/components/ui";
import { changeMyPassword } from "../actions";

export function ChangePasswordForm() {
  return (
    <Card>
      <SectionTitle>Пароль администратора</SectionTitle>
      <EntityForm
        compact
        resetAfterSubmit
        submitLabel="Сменить пароль"
        action={changeMyPassword}
        fields={[
          { name: "currentPassword", label: "Текущий пароль", type: "password", required: true },
          { name: "newPassword", label: "Новый пароль", type: "password", required: true, hint: "Не короче 6 символов" },
        ]}
      />
    </Card>
  );
}
