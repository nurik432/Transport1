"use client";

import Link from "next/link";
import { ActionButton } from "@/components/entity-form";
import { deleteStop } from "../actions";

/**
 * Row actions in the stops table.
 *
 * "Изменить" links into the workspace above instead of opening a second form in
 * the row: creating and editing a stop then go through exactly the same screen,
 * and the map is the only place coordinates come from.
 */
export function StopRowActions({ id, name }: { id: string; name: string }) {
  return (
    <span className="flex items-center gap-1">
      <Link
        href={`/admin/stops?stop=${id}#stop-workspace`}
        className="inline-flex min-h-9 cursor-pointer items-center rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-muted"
      >
        Изменить
      </Link>
      <ActionButton
        action={() => deleteStop(id)}
        label="Удалить"
        variant="ghost"
        className="text-danger"
        confirm={`Удалить остановку «${name}»?`}
      />
    </span>
  );
}
