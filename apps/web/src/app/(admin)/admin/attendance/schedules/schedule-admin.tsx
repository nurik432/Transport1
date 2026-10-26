"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, EntityForm, type FormResult } from "@/components/entity-form";
import { Button, Field, inputClass } from "@/components/ui";
import { deleteScheduleAction, renameScheduleAction, setDefaultAction, setScheduleStatusAction } from "./actions";
import { Notice } from "./schedule-forms";

/** Rename, archive, delete and "make default" for one schedule. */
export function ScheduleAdminActions({
  id,
  name,
  isDefault,
  status,
  used,
}: {
  id: string;
  name: string;
  isDefault: boolean;
  status: "active" | "archived";
  used: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rename" | "default">("idle");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, start] = useTransition();

  if (mode === "rename") {
    return (
      <div className="flex flex-col gap-2">
        <EntityForm
          compact
          submitLabel="Сохранить"
          action={renameScheduleAction}
          hiddenValues={{ id }}
          onDone={() => {
            setMode("idle");
            router.refresh();
          }}
          fields={[{ name: "name", label: "Название", required: true, defaultValue: name, wide: true }]}
        />
        <button type="button" onClick={() => setMode("idle")} className="self-start cursor-pointer text-sm text-muted-foreground hover:underline">
          Отмена
        </button>
      </div>
    );
  }

  if (mode === "default") {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-warn-soft p-3">
        <p className="text-sm text-warn-foreground">
          Все водители без назначения перейдут на «{name}» за все месяцы, включая прошлые. Тем, кто должен остаться на прежнем графике, назначьте его явно.
        </p>
        <Field label="Причина">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Notice result={result} />
        <div className="flex gap-2">
          <Button
            className="min-h-9 px-3 text-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await setDefaultAction({ id, reason: reason || null });
                setResult(res);
                if (res.ok) {
                  setMode("idle");
                  router.refresh();
                }
              })
            }
          >
            {pending ? "…" : "Сделать графиком по умолчанию"}
          </Button>
          <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => setMode("idle")}>
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => setMode("rename")}>
        Переименовать
      </Button>
      {!isDefault && status === "active" ? (
        <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => setMode("default")}>
          Сделать по умолчанию
        </Button>
      ) : null}
      {!isDefault ? (
        <ActionButton
          action={() => setScheduleStatusAction(id, status === "active" ? "archived" : "active")}
          label={status === "active" ? "В архив" : "Вернуть из архива"}
          variant="ghost"
        />
      ) : null}
      {!isDefault && !used ? (
        <ActionButton
          action={async () => {
            const res = await deleteScheduleAction(id);
            if (res.ok) router.push("/admin/attendance/schedules");
            return res;
          }}
          label="Удалить"
          variant="ghost"
          className="text-danger"
          confirm={`Удалить график «${name}»?`}
        />
      ) : null}
    </span>
  );
}
