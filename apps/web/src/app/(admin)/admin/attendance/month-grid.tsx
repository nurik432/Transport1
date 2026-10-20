"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DAY_STATUS_LABEL, OVERRIDE_STATUSES, formatLocalDate, formatLocalTime, isWorkingDay, type OverrideStatus } from "@transport/domain";
import type { MonthReport } from "@/lib/attendance-admin";
import type { DayScan } from "@/lib/attendance";
import type { FormResult } from "@/components/entity-form";
import { Button, Field, Pill, cx, inputClass } from "@/components/ui";
import { IconClose } from "@/components/icons";
import { adminAddScan, adminClearOverride, adminDeleteScan, adminReclassifyScan, adminSetOverride, loadDay, type DayDetails } from "./day-actions";

const KIND_LABEL: Record<DayScan["kind"], string> = { morning: "Утро", evening: "Вечер", off_window: "Вне окна" };
const GEO_LABEL: Record<DayScan["geo"], string> = { verified: "на месте", unverified: "без геопроверки", out_of_range: "далеко от точки" };
const AUDIT_LABEL: Record<string, string> = {
  scan_added: "Добавлена отметка",
  scan_deleted: "Удалена отметка",
  scan_reclassified: "Отметка переведена",
  override_set: "Поставлен статус",
  override_changed: "Изменён статус",
  override_cleared: "Статус снят",
};

type Selected = { userId: string; name: string; date: string };

/** Cell colour says the state; the code says it again for print and for colour-blind readers. */
function cellClass(code: string, working: boolean, future: boolean): string {
  if (future) return "text-subtle";
  switch (code) {
    case "Я":
    case "Яв":
      return "bg-ok-soft text-ok font-bold";
    case "Н":
      return "bg-warn-soft text-warn-foreground font-bold";
    case "НН":
      return "bg-danger-soft text-danger-foreground font-bold";
    case "О":
    case "Б":
    case "В":
      return "bg-primary-soft text-primary font-bold";
    default:
      return working ? "bg-danger-soft/40 text-muted-foreground" : "text-subtle";
  }
}

export function MonthGrid({ report }: { report: MonthReport }) {
  const [selected, setSelected] = useState<Selected | null>(null);

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 overflow-x-auto rounded-[--radius-card] bg-card">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-muted/60">
              <th scope="col" className="sticky left-0 z-10 bg-muted px-3 py-2 text-left text-[13px] font-semibold">
                Водитель
              </th>
              {report.dates.map((d) => {
                const working = isWorkingDay(d, report.settings);
                return (
                  <th
                    key={d}
                    scope="col"
                    className={cx("min-w-7 px-0.5 py-1 text-center font-medium tabular-nums", !working && "text-subtle")}
                    title={formatLocalDate(d, { weekday: "long", day: "numeric", month: "long" })}
                  >
                    <span className="block">{Number(d.slice(8, 10))}</span>
                    <span className="block text-[10px] font-normal">{formatLocalDate(d, { weekday: "short" })}</span>
                  </th>
                );
              })}
              <th scope="col" className="px-2 py-2 text-right text-[11px] font-semibold whitespace-nowrap">
                Полн.
              </th>
              <th scope="col" className="px-2 py-2 text-right text-[11px] font-semibold whitespace-nowrap">
                Непол.
              </th>
              <th scope="col" className="px-2 py-2 text-right text-[11px] font-semibold whitespace-nowrap">
                Нет
              </th>
              <th scope="col" className="px-2 py-2 text-right text-[11px] font-semibold whitespace-nowrap">
                О/Б/В
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.userId} className="border-t border-divider">
                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left text-[13px] font-medium whitespace-nowrap">
                  {row.name}
                  {!row.active ? <span className="ml-1 text-xs font-normal text-muted-foreground">неактивен</span> : null}
                </th>
                {row.cells.map((c) => {
                  const working = isWorkingDay(c.date, report.settings);
                  const future = c.date > report.today;
                  const active = selected?.userId === row.userId && selected.date === c.date;
                  return (
                    <td key={c.date} className="p-0.5">
                      <button
                        type="button"
                        disabled={future}
                        onClick={() => setSelected({ userId: row.userId, name: row.name, date: c.date })}
                        aria-label={`${row.name}, ${formatLocalDate(c.date)}: ${c.verdict ? DAY_STATUS_LABEL[c.verdict.status] : "ещё не наступил"}`}
                        className={cx(
                          "flex h-7 w-full min-w-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:ring-2 hover:ring-primary/40 disabled:cursor-default disabled:hover:ring-0",
                          cellClass(c.code, working, future),
                          active && "ring-2 ring-primary",
                        )}
                      >
                        {c.code || (future ? "" : "·")}
                      </button>
                    </td>
                  );
                })}
                <td className="px-2 text-right tabular-nums">{row.totals.full}</td>
                <td className="px-2 text-right tabular-nums">{row.totals.partial}</td>
                <td className="px-2 text-right tabular-nums">{row.totals.missing}</td>
                <td className="px-2 text-right tabular-nums">{row.totals.vacation + row.totals.sick + row.totals.dayOff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? <DayPanel key={`${selected.userId}:${selected.date}`} selected={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- day panel

function DayPanel({ selected, onClose }: { selected: Selected; onClose: () => void }) {
  const router = useRouter();
  const [details, setDetails] = useState<DayDetails | null>(null);
  const [notice, setNotice] = useState<FormResult | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    loadDay(selected.userId, selected.date).then((d) => {
      if (alive) setDetails(d);
    });
    return () => {
      alive = false;
    };
  }, [selected.userId, selected.date, version]);

  /** After a successful edit: refresh the grid and reload the panel. */
  function after(res: FormResult) {
    setNotice(res);
    if (res.ok) {
      router.refresh();
      setVersion((v) => v + 1);
    }
  }

  const day = details?.day ?? null;
  const verdict = day?.verdict ?? null;

  return (
    <aside
      aria-label="День водителя"
      className="flex w-full flex-col gap-4 rounded-[--radius-card] bg-card p-4 xl:sticky xl:top-4 xl:w-[380px] xl:shrink-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-muted-foreground">{selected.name}</p>
          <h2 className="text-[17px] font-bold">{formatLocalDate(selected.date, { weekday: "long", day: "numeric", month: "long" })}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть" className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
          <IconClose className="size-4" />
        </button>
      </div>

      {!details ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {verdict ? (
              <Pill tone={verdict.status === "full" || verdict.status === "worked" ? "ok" : verdict.status === "partial" ? "warn" : verdict.status === "none" ? "neutral" : verdict.status === "not_worked" ? "danger" : "primary"}>
                {DAY_STATUS_LABEL[verdict.status]}
                {verdict.offSchedule ? " · вне графика" : ""}
              </Pill>
            ) : null}
            {verdict?.overridden ? <span className="text-xs text-muted-foreground">поставлен администратором{day?.overrideReason ? `: ${day.overrideReason}` : ""}</span> : null}
          </div>

          {notice ? (
            <p role="status" className={cx("rounded-lg px-3 py-2 text-sm", notice.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger-foreground")}>
              {notice.ok ? notice.message : notice.error}
            </p>
          ) : null}

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Отметки</h3>
            {details.scans.length === 0 ? (
              <p className="text-sm text-muted-foreground">Отметок нет.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-divider rounded-lg border border-border">
                {details.scans.map((s) => (
                  <ScanRow key={s.id} scan={s} onDone={after} />
                ))}
              </ul>
            )}
            <AddScanForm userId={selected.userId} date={selected.date} onDone={after} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Статус дня</h3>
            <OverrideForm userId={selected.userId} date={selected.date} overridden={Boolean(verdict?.overridden)} onDone={after} />
          </section>

          {details.audit.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">История правок</h3>
              <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {details.audit.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium text-body">{AUDIT_LABEL[a.action] ?? a.action}</span>
                    {describeAudit(a.action, a.before, a.after)} — {a.adminName ?? "администратор"}, {formatLocalDate(a.at.toISOString().slice(0, 10))}{" "}
                    {formatLocalTime(a.at)}
                    {a.reason ? ` · ${a.reason}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </aside>
  );
}

function describeAudit(action: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  const kind = (v: unknown) => (typeof v === "string" && v in KIND_LABEL ? KIND_LABEL[v as DayScan["kind"]].toLowerCase() : String(v ?? ""));
  const status = (v: unknown) => (typeof v === "string" && v in DAY_STATUS_LABEL ? DAY_STATUS_LABEL[v as OverrideStatus].toLowerCase() : String(v ?? ""));
  switch (action) {
    case "scan_added":
      return ` (${kind(after?.kind)} ${String(after?.time ?? "")})`;
    case "scan_deleted":
      return ` (${kind(before?.kind)} ${String(before?.time ?? "")})`;
    case "scan_reclassified":
      return ` (${kind(before?.kind)} → ${kind(after?.kind)})`;
    case "override_set":
      return ` (${status(after?.status)})`;
    case "override_changed":
      return ` (${status(before?.status)} → ${status(after?.status)})`;
    case "override_cleared":
      return ` (был: ${status(before?.status)})`;
    default:
      return "";
  }
}

// ---------------------------------------------------------------- scan row

function ScanRow({ scan, onDone }: { scan: DayScan; onDone: (r: FormResult) => void }) {
  const [mode, setMode] = useState<"idle" | "delete" | "move">("idle");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"morning" | "evening">(scan.kind === "evening" ? "morning" : "evening");
  const [pending, start] = useTransition();
  const gone = Boolean(scan.deletedAt);

  function submit() {
    start(async () => {
      const res = mode === "delete" ? await adminDeleteScan({ scanId: scan.id, reason }) : await adminReclassifyScan({ scanId: scan.id, kind, reason });
      onDone(res);
      if (res.ok) {
        setMode("idle");
        setReason("");
      }
    });
  }

  return (
    <li className={cx("flex flex-col gap-2 px-3 py-2 text-sm", gone && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cx("font-semibold tabular-nums", gone && "line-through")}>
          {KIND_LABEL[scan.kind]} {scan.time}
        </span>
        <span className="text-xs text-muted-foreground">
          {scan.source === "manual" ? "вручную" : scan.pointName ?? "точка удалена"} · {GEO_LABEL[scan.geo]}
          {scan.duplicate ? " · повтор" : ""}
          {gone ? " · удалена" : ""}
        </span>
        {!gone && mode === "idle" ? (
          <span className="ml-auto flex gap-1">
            {scan.kind === "off_window" || scan.duplicate ? (
              <button type="button" onClick={() => setMode("move")} className="cursor-pointer text-xs font-medium text-primary hover:underline">
                Засчитать
              </button>
            ) : null}
            <button type="button" onClick={() => setMode("delete")} className="cursor-pointer text-xs font-medium text-danger hover:underline">
              Удалить
            </button>
          </span>
        ) : null}
      </div>
      {mode !== "idle" ? (
        <div className="flex flex-col gap-2 rounded-lg bg-background p-2.5">
          {mode === "move" ? (
            <Field label="Засчитать как">
              <select value={kind} onChange={(e) => setKind(e.target.value as "morning" | "evening")} className={inputClass}>
                <option value="morning">Утро</option>
                <option value="evening">Вечер</option>
              </select>
            </Field>
          ) : null}
          <Field label="Причина">
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder={mode === "delete" ? "Например: отметка с чужого телефона" : "Например: сканировал в 11:05, опоздал автобус"} />
          </Field>
          <div className="flex gap-2">
            <Button variant={mode === "delete" ? "danger" : "primary"} className="min-h-9 px-3 text-sm" disabled={pending} onClick={submit}>
              {pending ? "…" : mode === "delete" ? "Удалить отметку" : "Засчитать"}
            </Button>
            <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => setMode("idle")}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------- add scan

function AddScanForm({ userId, date, onDone }: { userId: string; date: string; onDone: (r: FormResult) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"morning" | "evening">("morning");
  const [time, setTime] = useState("08:00");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start cursor-pointer text-sm font-medium text-primary hover:underline">
        + Добавить отметку
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-background p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Окно">
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as "morning" | "evening";
              setKind(k);
              setTime(k === "morning" ? "08:00" : "17:00");
            }}
            className={inputClass}
          >
            <option value="morning">Утро</option>
            <option value="evening">Вечер</option>
          </select>
        </Field>
        <Field label="Время">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Причина">
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Например: забыл телефон, подтвердил охранник" />
      </Field>
      <div className="flex gap-2">
        <Button
          className="min-h-9 px-3 text-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await adminAddScan({ userId, date, kind, time, reason });
              onDone(res);
              if (res.ok) {
                setOpen(false);
                setReason("");
              }
            })
          }
        >
          {pending ? "…" : "Добавить"}
        </Button>
        <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- override

function OverrideForm({ userId, date, overridden, onDone }: { userId: string; date: string; overridden: boolean; onDone: (r: FormResult) => void }) {
  const [status, setStatus] = useState<OverrideStatus>("vacation");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  function run(fn: () => Promise<FormResult>) {
    start(async () => {
      const res = await fn();
      onDone(res);
      if (res.ok) setReason("");
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-background p-2.5">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Статус">
          <select value={status} onChange={(e) => setStatus(e.target.value as OverrideStatus)} className={inputClass}>
            {OVERRIDE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DAY_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Причина" hint="Статус перекрывает расчёт по отметкам полностью">
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Например: заявление на отпуск от 12.10" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-9 px-3 text-sm" disabled={pending} onClick={() => run(() => adminSetOverride({ userId, date, status, reason }))}>
          {pending ? "…" : overridden ? "Изменить статус" : "Поставить статус"}
        </Button>
        {overridden ? (
          <Button variant="danger-ghost" className="min-h-9 px-3 text-sm" disabled={pending} onClick={() => run(() => adminClearOverride({ userId, date, reason }))}>
            Снять статус
          </Button>
        ) : null}
      </div>
    </div>
  );
}
