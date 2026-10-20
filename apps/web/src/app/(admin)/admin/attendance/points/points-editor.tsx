"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionButton, Collapsible, EntityForm } from "@/components/entity-form";
import { reissuePointToken, savePoint, setPointStatus } from "../actions";

const STATUS_OPTIONS = [
  { value: "active", label: "Работает" },
  { value: "inactive", label: "Отключена" },
];

const FIELDS = (defaultRadiusM: number, defaults?: { name: string; lat: number; lng: number; radiusM: number | null; status: string }) => [
  { name: "name", label: "Название", required: true, placeholder: "Завод, проходная", defaultValue: defaults?.name, wide: true },
  { name: "lat", label: "Широта", type: "number" as const, required: true, placeholder: "40.26900", defaultValue: defaults?.lat },
  { name: "lng", label: "Долгота", type: "number" as const, required: true, placeholder: "69.66500", defaultValue: defaults?.lng },
  {
    name: "radiusM",
    label: "Радиус, м",
    type: "number" as const,
    placeholder: String(defaultRadiusM),
    defaultValue: defaults?.radiusM ?? null,
    hint: `Пусто — общий радиус из настроек (${defaultRadiusM} м)`,
  },
  {
    name: "status",
    label: "Статус",
    type: "select" as const,
    options: STATUS_OPTIONS,
    required: true,
    defaultValue: defaults?.status ?? "active",
  },
];

export function PointsEditor({ defaultRadiusM }: { defaultRadiusM: number }) {
  return (
    <Collapsible title="Добавить точку">
      <EntityForm compact resetAfterSubmit submitLabel="Добавить" action={savePoint} fields={FIELDS(defaultRadiusM)} />
    </Collapsible>
  );
}

export function PointRowActions({
  id,
  name,
  lat,
  lng,
  radiusM,
  status,
  defaultRadiusM,
}: {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number | null;
  status: "active" | "inactive";
  defaultRadiusM: number;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <span className="flex flex-wrap items-center gap-1">
        <Link
          href={`/admin/attendance/points/${id}/print`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-9 inline-flex items-center rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-muted"
        >
          Печать QR
        </Link>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-h-9 cursor-pointer rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-muted"
        >
          Изменить
        </button>
        <ActionButton
          action={() => reissuePointToken(id)}
          label="Перевыпустить QR"
          variant="ghost"
          confirm={`Перевыпустить QR точки «${name}»? Все распечатанные коды перестанут работать, их придётся напечатать заново.`}
        />
        <ActionButton
          action={() => setPointStatus(id, status === "active" ? "inactive" : "active")}
          label={status === "active" ? "Отключить" : "Включить"}
          variant="ghost"
          className={status === "active" ? "text-danger" : undefined}
        />
      </span>
    );
  }

  return (
    <div className="min-w-80 py-2">
      <EntityForm
        compact
        submitLabel="Сохранить"
        action={savePoint}
        hiddenValues={{ id }}
        onDone={() => setEditing(false)}
        fields={FIELDS(defaultRadiusM, { name, lat, lng, radiusM, status })}
      />
      <button type="button" onClick={() => setEditing(false)} className="mt-2 cursor-pointer text-sm text-muted-foreground hover:underline">
        Отмена
      </button>
    </div>
  );
}
