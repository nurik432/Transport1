"use client";

import type { LoadThresholds } from "@transport/domain";
import { EntityForm } from "@/components/entity-form";
import { Card, SectionTitle } from "@/components/ui";
import { updateThresholds } from "../actions";

export function ThresholdsForm({ thresholds }: { thresholds: LoadThresholds }) {
  return (
    <Card>
      <SectionTitle>Пороги загрузки</SectionTitle>
      <EntityForm
        compact
        submitLabel="Сохранить пороги"
        action={updateThresholds}
        fields={[
          {
            name: "overloadPct",
            label: "Рейс считается перегруженным, %",
            type: "number",
            required: true,
            defaultValue: thresholds.overloadPct,
            hint: "По умолчанию 100",
          },
          {
            name: "overloadShare",
            label: "Доля перегруженных рейсов",
            type: "number",
            required: true,
            defaultValue: thresholds.overloadShare,
            hint: "0.3 — это 30% рейсов",
          },
          {
            name: "overloadAvgPct",
            label: "Средняя загрузка для перегрузки, %",
            type: "number",
            required: true,
            defaultValue: thresholds.overloadAvgPct,
          },
          {
            name: "lowAvgPct",
            label: "Низкая загрузка ниже, %",
            type: "number",
            required: true,
            defaultValue: thresholds.lowAvgPct,
          },
          {
            name: "minTrips",
            label: "Минимум рейсов для оценки",
            type: "number",
            required: true,
            defaultValue: thresholds.minTrips,
            hint: "Меньше — статус «нет данных»",
          },
        ]}
      />
    </Card>
  );
}
