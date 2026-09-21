"use client";

import type { DeviationSettings } from "@transport/domain";
import { EntityForm } from "@/components/entity-form";
import { Card, SectionTitle } from "@/components/ui";
import { updateLiveSettings } from "../actions";

export function LiveSettingsForm({ settings }: { settings: DeviationSettings }) {
  return (
    <Card>
      <SectionTitle>Мониторинг и GPS</SectionTitle>
      <EntityForm
        compact
        submitLabel="Сохранить настройки"
        action={updateLiveSettings}
        fields={[
          {
            name: "offRouteM",
            label: "Отклонение от маршрута, м",
            type: "number",
            required: true,
            defaultValue: settings.offRouteM,
            hint: "Дальше этого расстояния транспорт считается сошедшим с маршрута",
          },
          {
            name: "consecutive",
            label: "Подряд идущих точек",
            type: "number",
            required: true,
            defaultValue: settings.consecutive,
            hint: "Сколько точек подряд должны быть вне маршрута",
          },
          {
            name: "missingAfterMin",
            label: "Нет данных, мин",
            type: "number",
            required: true,
            defaultValue: settings.missingAfterMin,
            hint: "После этого рейс попадёт в сигналы",
          },
          {
            name: "approachMin",
            label: "Уведомлять за, мин",
            type: "number",
            required: true,
            defaultValue: settings.approachMin,
            hint: "За сколько минут сообщать пассажиру о подъезде",
          },
        ]}
      />
    </Card>
  );
}
