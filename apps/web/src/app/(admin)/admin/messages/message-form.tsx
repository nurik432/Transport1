"use client";

import { EntityForm } from "@/components/entity-form";
import { Card, SectionTitle } from "@/components/ui";
import { sendMessage } from "../actions";

export function MessageForm({ routeOptions }: { routeOptions: { value: string; label: string }[] }) {
  return (
    <Card>
      <SectionTitle>Отправить сообщение</SectionTitle>
      <EntityForm
        compact
        resetAfterSubmit
        submitLabel="Отправить"
        action={sendMessage}
        fields={[
          {
            name: "audience",
            label: "Кому",
            type: "select",
            required: true,
            defaultValue: "route_passengers",
            options: [
              { value: "route_passengers", label: "Пассажирам маршрута" },
              { value: "route_driver", label: "Водителям маршрута" },
              { value: "all_passengers", label: "Всем пассажирам" },
              { value: "all_drivers", label: "Всем водителям" },
            ],
          },
          {
            name: "routeId",
            label: "Маршрут",
            type: "select",
            options: routeOptions,
            hint: "Нужен для аудитории «маршрута»",
          },
          { name: "title", label: "Заголовок", required: true, placeholder: "Изменение расписания", wide: true },
          { name: "body", label: "Текст", required: true, placeholder: "С понедельника рейс 08:00 отправляется в 08:10", wide: true },
        ]}
      />
    </Card>
  );
}
