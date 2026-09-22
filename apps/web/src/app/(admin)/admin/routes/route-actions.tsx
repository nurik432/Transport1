"use client";

import Link from "next/link";
import { ActionButton } from "@/components/entity-form";
import { deleteRoute, rebuildGeometry } from "../actions";

export function RouteRowActions({ id, name }: { id: string; name: string }) {
  return (
    <span className="flex items-center gap-1">
      <Link
        href={`/admin/routes/${id}`}
        className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-muted"
      >
        Изменить
      </Link>
      <ActionButton
        action={() => deleteRoute(id)}
        label="Удалить"
        variant="ghost"
        className="text-danger"
        confirm={`Удалить маршрут ${name}? Если по нему есть завершённые рейсы, он будет переведён в неактивные.`}
      />
    </span>
  );
}

/** Rebuilds the road geometry of every route through the routing provider. */
export function RebuildGeometryButton() {
  return (
    <ActionButton
      action={rebuildGeometry}
      label="Построить путь по дорогам"
      variant="secondary"
      confirm="Запросить геометрию всех маршрутов у сервиса маршрутизации? Это займёт несколько секунд."
    />
  );
}
