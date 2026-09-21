"use client";

import { useState, useTransition } from "react";
import { Button, Field, cx, inputClass } from "./ui";

export interface FormField {
  name: string;
  label: string;
  type?: "text" | "number" | "password" | "tel" | "select" | "date" | "time" | "color";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  placeholder?: string;
  defaultValue?: string | number | null;
  /** grid span on wide screens */
  wide?: boolean;
}

export interface FormResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export function EntityForm({
  fields,
  action,
  submitLabel = "Сохранить",
  hiddenValues,
  onDone,
  resetAfterSubmit = false,
  compact = false,
}: {
  fields: FormField[];
  action: (input: unknown) => Promise<FormResult>;
  submitLabel?: string;
  hiddenValues?: Record<string, unknown>;
  onDone?: () => void;
  resetAfterSubmit?: boolean;
  compact?: boolean;
}) {
  const initial = Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])) as Record<string, string | number>;
  const [values, setValues] = useState(initial);
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setResult(null);
    start(async () => {
      const payload: Record<string, unknown> = { ...hiddenValues };
      for (const f of fields) {
        const raw = values[f.name];
        payload[f.name] = raw === "" ? (f.type === "number" ? null : "") : raw;
      }
      const res = await action(payload);
      setResult(res);
      if (res.ok) {
        if (resetAfterSubmit) setValues(initial);
        onDone?.();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cx("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {fields.map((f) => (
          <div key={f.name} className={f.wide ? "sm:col-span-2" : undefined}>
            <Field label={f.label} hint={f.hint}>
              {f.type === "select" ? (
                <select
                  className={inputClass}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                >
                  {!f.required ? <option value="">— не выбрано —</option> : null}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputClass}
                  type={f.type ?? "text"}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  value={String(values[f.name] ?? "")}
                  placeholder={f.placeholder}
                  required={f.required}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
            </Field>
          </div>
        ))}
      </div>

      {result?.error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}
      {result?.ok && result.message ? (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-green-800">
          {result.message}
        </p>
      ) : null}

      <div>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Сохранение…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Small inline button that calls a server action with a fixed argument. */
export function ActionButton({
  action,
  label,
  confirm,
  variant = "ghost",
  className,
}: {
  action: () => Promise<FormResult>;
  label: string;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        className={cx("min-h-9 px-3 text-sm", className)}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const res = await action();
            if (!res.ok) setError(res.error ?? "Не удалось выполнить действие");
          });
        }}
      >
        {pending ? "…" : label}
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

/** Collapsible "add new" block so list pages stay uncluttered. */
export function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[--radius-card] border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between px-4 text-sm font-medium"
      >
        {title}
        <span className="text-muted-foreground">{open ? "Свернуть" : "Открыть"}</span>
      </button>
      {open ? <div className="border-t border-border p-4">{children}</div> : null}
    </div>
  );
}
