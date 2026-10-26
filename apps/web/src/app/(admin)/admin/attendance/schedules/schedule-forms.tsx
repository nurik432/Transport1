"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { localNow, patternLabel, validatePattern, type WorkPattern, type WorkScheduleKind } from "@transport/domain";
import type { FormResult } from "@/components/entity-form";
import { Button, Field, cx, inputClass } from "@/components/ui";
import { assignScheduleAction, createScheduleAction, setVersionAction } from "./actions";

const WEEKDAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

export function Notice({ result }: { result: FormResult | null }) {
  if (!result) return null;
  return result.ok ? (
    result.message ? (
      <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-green-800">
        {result.message}
      </p>
    ) : null
  ) : (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-red-800">
      {result.error}
    </p>
  );
}

// ---------------------------------------------------------------- pattern

export interface PatternState {
  weekdays: number[];
  workDays: string;
  restDays: string;
  holidaysOff: boolean;
}

export function initialPattern(kind: WorkScheduleKind, from?: { pattern: WorkPattern; holidaysOff: boolean } | null): PatternState {
  if (from?.pattern.kind === "weekly") return { weekdays: from.pattern.weekdays, workDays: "2", restDays: "2", holidaysOff: from.holidaysOff };
  if (from?.pattern.kind === "cycle")
    return { weekdays: [1, 2, 3, 4, 5], workDays: String(from.pattern.workDays), restDays: String(from.pattern.restDays), holidaysOff: from.holidaysOff };
  return { weekdays: [1, 2, 3, 4, 5], workDays: "2", restDays: "2", holidaysOff: kind === "weekly" };
}

export function toPattern(kind: WorkScheduleKind, s: PatternState): WorkPattern {
  return kind === "weekly" ? { kind, weekdays: s.weekdays } : { kind, workDays: Number(s.workDays), restDays: Number(s.restDays) };
}

/** Days of a schedule: weekday toggles or "N on / M off", plus the holidays switch. */
export function PatternFields({ kind, value, onChange }: { kind: WorkScheduleKind; value: PatternState; onChange: (next: PatternState) => void }) {
  const pattern = toPattern(kind, value);
  const problem = validatePattern(pattern);

  return (
    <div className="flex flex-col gap-3">
      {kind === "weekly" ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Рабочие дни недели</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = value.weekdays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange({ ...value, weekdays: on ? value.weekdays.filter((x) => x !== d.value) : [...value.weekdays, d.value].sort((a, b) => a - b) })
                  }
                  className={cx(
                    "min-h-10 min-w-11 cursor-pointer rounded-lg border px-2 text-sm font-semibold transition-colors",
                    on ? "border-primary bg-primary text-on-primary" : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <Field label="Рабочих дней подряд">
            <input type="number" min={1} inputMode="numeric" className={inputClass} value={value.workDays} onChange={(e) => onChange({ ...value, workDays: e.target.value })} />
          </Field>
          <Field label="Выходных подряд">
            <input type="number" min={0} inputMode="numeric" className={inputClass} value={value.restDays} onChange={(e) => onChange({ ...value, restDays: e.target.value })} />
          </Field>
        </div>
      )}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={value.holidaysOff} onChange={(e) => onChange({ ...value, holidaysOff: e.target.checked })} />
        Праздники — выходные дни
      </label>
      <p className={cx("text-xs", problem ? "text-danger" : "text-muted-foreground")}>
        {problem ?? `Получится: ${patternLabel(pattern)}${value.holidaysOff ? ", праздники выходные" : ", праздники рабочие"}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- reason

/** Shown when the date reaches into a month already closed; the reason is then required. */
function PastWarning({ date, closedBefore, reason, onReason }: { date: string; closedBefore: string; reason: string; onReason: (v: string) => void }) {
  if (!date || date >= closedBefore) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-warn-soft p-3">
      <p className="text-sm text-warn-foreground">Дата раньше текущего месяца: изменится табель за прошлые месяцы, в том числе уже выгруженный.</p>
      <Field label="Причина">
        <input className={inputClass} value={reason} onChange={(e) => onReason(e.target.value)} placeholder="Например: водитель с 1 сентября работал по 2/2" />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------- create

export function CreateScheduleForm() {
  const router = useRouter();
  const [kind, setKind] = useState<WorkScheduleKind>("weekly");
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState(() => initialPattern("weekly"));
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setResult(null);
    start(async () => {
      const res = await createScheduleAction({ name, pattern: toPattern(kind, pattern), holidaysOff: pattern.holidaysOff });
      setResult(res);
      if (res.ok && res.id) router.push(`/admin/attendance/schedules/${res.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Название" hint="Например: 6/1 (пн–сб) или 2/2 сменный">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Тип" hint="Тип потом не меняется">
          <select
            className={inputClass}
            value={kind}
            onChange={(e) => {
              const k = e.target.value as WorkScheduleKind;
              setKind(k);
              setPattern(initialPattern(k));
            }}
          >
            <option value="weekly">Недельный — по дням недели</option>
            <option value="cycle">Сменный — N через M</option>
          </select>
        </Field>
      </div>
      <PatternFields kind={kind} value={pattern} onChange={setPattern} />
      <Notice result={result} />
      <div>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Сохранение…" : "Создать график"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- version

export function VersionForm({
  scheduleId,
  kind,
  current,
  closedBefore,
}: {
  scheduleId: string;
  kind: WorkScheduleKind;
  current: { pattern: WorkPattern; holidaysOff: boolean } | null;
  closedBefore: string;
}) {
  const router = useRouter();
  const [pattern, setPattern] = useState(() => initialPattern(kind, current));
  const [from, setFrom] = useState(() => localNow().date);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setResult(null);
    start(async () => {
      const res = await setVersionAction({
        scheduleId,
        effectiveFrom: from,
        pattern: toPattern(kind, pattern),
        holidaysOff: pattern.holidaysOff,
        reason: reason || null,
      });
      setResult(res);
      if (res.ok) {
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PatternFields kind={kind} value={pattern} onChange={setPattern} />
      <div className="sm:max-w-xs">
        <Field label="Действует с" hint="Все водители на этом графике перейдут на новые дни с этой даты">
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
      </div>
      <PastWarning date={from} closedBefore={closedBefore} reason={reason} onReason={setReason} />
      <Notice result={result} />
      <div>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Сохранение…" : "Сохранить версию"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- assign

export interface AssignOption {
  value: string;
  label: string;
  kind: WorkScheduleKind;
}

/**
 * Put one or many drivers on a schedule from a date. With `drivers` the admin
 * picks them; with `userId` the form is for that one driver.
 */
export function AssignForm({
  schedules,
  closedBefore,
  fixedScheduleId,
  drivers,
  userId,
  onDone,
}: {
  schedules: AssignOption[];
  closedBefore: string;
  fixedScheduleId?: string;
  drivers?: { value: string; label: string; hint?: string }[];
  userId?: string;
  onDone?: (r: FormResult) => void;
}) {
  const router = useRouter();
  const [scheduleId, setScheduleId] = useState(fixedScheduleId ?? "");
  const [from, setFrom] = useState(() => localNow().date);
  const [cycleStart, setCycleStart] = useState("");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, start] = useTransition();
  const kind = schedules.find((s) => s.value === scheduleId)?.kind;

  function submit() {
    setResult(null);
    start(async () => {
      const res = await assignScheduleAction({
        userIds: userId ? [userId] : picked,
        scheduleId,
        effectiveFrom: from,
        cycleStart: kind === "cycle" && cycleStart ? cycleStart : null,
        reason: reason || null,
      });
      setResult(res);
      onDone?.(res);
      if (res.ok) {
        setPicked([]);
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {drivers ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Водители</legend>
          {drivers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Все водители уже на этом графике.</p>
          ) : (
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
              {drivers.map((d) => (
                <label key={d.value} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={picked.includes(d.value)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, d.value] : p.filter((x) => x !== d.value)))}
                  />
                  <span>{d.label}</span>
                  {d.hint ? <span className="text-xs text-muted-foreground">{d.hint}</span> : null}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {fixedScheduleId ? null : (
          <Field label="График">
            <select className={inputClass} value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
              <option value="">— выберите —</option>
              {schedules.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="С какой даты">
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        {kind === "cycle" ? (
          <Field label="Первый рабочий день цикла" hint="Пусто — с даты назначения. Сменщикам ставьте разные дни">
            <input type="date" className={inputClass} value={cycleStart} onChange={(e) => setCycleStart(e.target.value)} />
          </Field>
        ) : null}
      </div>
      <PastWarning date={from} closedBefore={closedBefore} reason={reason} onReason={setReason} />
      <Notice result={result} />
      <div>
        <Button onClick={submit} disabled={pending || !scheduleId || (!userId && picked.length === 0)}>
          {pending ? "Сохранение…" : userId ? "Назначить график" : `Назначить${picked.length ? ` (${picked.length})` : ""}`}
        </Button>
      </div>
    </div>
  );
}
