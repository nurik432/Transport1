"use client";

import type { AttendanceSettings } from "@transport/domain";
import { EntityForm } from "@/components/entity-form";
import { Card, SectionTitle } from "@/components/ui";
import { updateAttendanceSettings } from "../attendance/actions";

export function AttendanceSettingsForm({ settings }: { settings: AttendanceSettings }) {
  return (
    <Card id="attendance">
      <SectionTitle>Табель водителей</SectionTitle>
      <EntityForm
        compact
        submitLabel="Сохранить настройки табеля"
        action={updateAttendanceSettings}
        fields={[
          { name: "morningFrom", label: "Утро с", type: "time", required: true, defaultValue: settings.morning.from },
          { name: "morningTo", label: "Утро до", type: "time", required: true, defaultValue: settings.morning.to },
          { name: "eveningFrom", label: "Вечер с", type: "time", required: true, defaultValue: settings.evening.from },
          { name: "eveningTo", label: "Вечер до", type: "time", required: true, defaultValue: settings.evening.to },
          {
            name: "defaultRadiusM",
            label: "Радиус точки по умолчанию, м",
            type: "number",
            required: true,
            defaultValue: settings.defaultRadiusM,
            hint: "Дальше этого расстояния от точки скан QR не принимается",
          },
          {
            name: "holidays",
            label: "Праздники",
            defaultValue: settings.holidays.join(", "),
            placeholder: "2026-03-21, 2026-03-22",
            hint: "Даты через запятую, вид ГГГГ-ММ-ДД; в эти дни отсутствие отметок не считается пропуском",
            wide: true,
          },
        ]}
      />
    </Card>
  );
}
