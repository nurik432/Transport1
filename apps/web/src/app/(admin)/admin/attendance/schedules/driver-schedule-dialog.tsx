"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatLocalDate } from "@transport/domain";
import type { FormResult } from "@/components/entity-form";
import { Button, Field, inputClass } from "@/components/ui";
import { IconClose } from "@/components/icons";
import { deleteAssignmentAction, loadDriverSchedule, type DriverScheduleDialogData } from "./actions";
import { AssignForm, Notice } from "./schedule-forms";

/** Button that opens the driver's schedule dialog; shows the schedule name. */
export function DriverScheduleButton({ userId, name, scheduleName, className }: { userId: string; name: string; scheduleName: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Сменить график"
        className={className ?? "cursor-pointer text-left text-sm text-primary hover:underline"}
      >
        {scheduleName}
      </button>
      {/* Portal: inside a sticky table cell the dialog would sit under the next rows. */}
      {open ? createPortal(<DriverScheduleDialog userId={userId} name={name} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

export function DriverScheduleDialog({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<DriverScheduleDialogData | null | undefined>(undefined);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    loadDriverSchedule(userId).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [userId, version]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reload = (r: FormResult) => r.ok && setVersion((v) => v + 1);

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-[rgba(4,8,16,.45)]" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-schedule-title"
        className="fixed inset-x-4 top-[6vh] z-50 mx-auto flex max-h-[88vh] max-w-xl flex-col gap-4 overflow-y-auto rounded-[--radius-card] bg-card p-5 text-left text-sm font-normal whitespace-normal shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-muted-foreground">{name}</p>
            <h2 id="driver-schedule-title" className="text-[17px] font-bold">
              График работы{data ? `: ${data.state.currentName}` : ""}
            </h2>
            {data && !data.state.currentId ? <p className="text-xs text-muted-foreground">по умолчанию, без назначения</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <IconClose className="size-4" />
          </button>
        </div>

        {data === undefined ? (
          <p className="text-muted-foreground">Загрузка…</p>
        ) : data === null ? (
          <p className="text-danger">Водитель не найден.</p>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">Сменить график</h3>
              <AssignForm schedules={data.options} closedBefore={data.closedBefore} userId={userId} onDone={reload} />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">История назначений</h3>
              {data.state.history.length === 0 ? (
                <p className="text-muted-foreground">Назначений не было: водитель на графике по умолчанию.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-divider rounded-lg border border-border">
                  {data.state.history.map((h) => (
                    <HistoryRow key={h.id} row={h} closedBefore={data.closedBefore} onDone={reload} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </section>
    </>
  );
}

function HistoryRow({
  row,
  closedBefore,
  onDone,
}: {
  row: DriverScheduleDialogData["state"]["history"][number];
  closedBefore: string;
  onDone: (r: FormResult) => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, start] = useTransition();
  const past = row.effectiveFrom < closedBefore;

  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{row.scheduleName}</span>
        <span className="text-xs text-muted-foreground">
          с {formatLocalDate(row.effectiveFrom, { day: "numeric", month: "long", year: "numeric" })}
          {row.cycleStart ? `, цикл с ${formatLocalDate(row.cycleStart, { day: "numeric", month: "long" })}` : ""}
        </span>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className="ml-auto cursor-pointer text-xs font-medium text-danger hover:underline">
            Отменить
          </button>
        ) : null}
      </div>
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-lg bg-background p-2.5">
          <p className="text-xs text-muted-foreground">С этой даты снова будет действовать предыдущее назначение или график по умолчанию.</p>
          {past ? (
            <Field label="Причина" hint="Обязательна: изменится табель за прошлые месяцы">
              <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          ) : null}
          <Notice result={result} />
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="min-h-9 px-3 text-sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteAssignmentAction({ id: row.id, reason: reason || null });
                  setResult(res);
                  if (res.ok) {
                    router.refresh();
                    onDone(res);
                  }
                })
              }
            >
              {pending ? "…" : "Отменить назначение"}
            </Button>
            <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => setConfirming(false)}>
              Назад
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
