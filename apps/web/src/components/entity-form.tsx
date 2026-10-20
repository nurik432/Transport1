"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Field, cx, inputClass } from "./ui";
import { PointPicker, type PickedPoint } from "./point-picker";

export interface FormField {
  name: string;
  label: string;
  /** "point" is picked on a map and submitted as `lat` / `lng` */
  type?: "text" | "number" | "password" | "tel" | "select" | "date" | "time" | "color" | "point";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  placeholder?: string;
  defaultValue?: string | number | null;
  /** grid span on wide screens */
  wide?: boolean;
  /** "point" only: the starting point */
  defaultPoint?: PickedPoint | null;
  /** "point" only: field whose value (metres) is drawn as a circle around the point */
  radiusFrom?: string;
  /** "point" only: radius used while that field is empty */
  radiusFallback?: number;
  /** "point" only: text field that gets the address of the picked place while it is empty */
  addressTo?: string;
}

export interface FormResult {
  ok: boolean;
  error?: string;
  message?: string;
  /** message per field name, shown under that field instead of only on top */
  fieldErrors?: Record<string, string>;
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
  const initial = Object.fromEntries(
    fields.filter((f) => f.type !== "point").map((f) => [f.name, f.defaultValue ?? ""]),
  ) as Record<string, string | number>;
  const initialPoint = fields.find((f) => f.type === "point")?.defaultPoint ?? null;
  const [values, setValues] = useState(initial);
  const [point, setPoint] = useState<PickedPoint | null>(initialPoint);
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, start] = useTransition();
  const lookup = useRef<AbortController | null>(null);

  function submit() {
    setResult(null);
    start(async () => {
      const payload: Record<string, unknown> = { ...hiddenValues };
      for (const f of fields) {
        if (f.type === "point") {
          payload.lat = point?.lat ?? null;
          payload.lng = point?.lng ?? null;
          continue;
        }
        const raw = values[f.name];
        payload[f.name] = raw === "" ? (f.type === "number" ? null : "") : raw;
      }
      const res = await action(payload);
      setResult(res);
      if (res.ok) {
        if (resetAfterSubmit) {
          setValues(initial);
          setPoint(initialPoint);
        }
        onDone?.();
      }
    });
  }

  /** An empty address field follows the point; one typed by hand is left alone. */
  function fillAddress(field: string, next: PickedPoint, knownAddress?: string) {
    lookup.current?.abort();
    if (String(values[field] ?? "").trim()) return;
    if (knownAddress) {
      setValues((v) => ({ ...v, [field]: knownAddress }));
      return;
    }
    const controller = new AbortController();
    lookup.current = controller;
    fetch(`/api/v1/geocode?lat=${next.lat}&lng=${next.lng}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (controller.signal.aborted || !json.ok || !json.place?.address) return;
        setValues((v) => (String(v[field] ?? "").trim() ? v : { ...v, [field]: json.place.address }));
      })
      .catch(() => {});
  }

  function renderPoint(f: FormField) {
    const radius = f.radiusFrom ? Number(values[f.radiusFrom]) || f.radiusFallback : undefined;
    return (
      <PointPicker
        value={point}
        radiusM={radius}
        optional={!f.required}
        onChange={(next, place) => {
          setPoint(next);
          if (next && f.addressTo) fillAddress(f.addressTo, next, place ? place.address || place.name : undefined);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cx("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {fields.map((f) =>
          f.type === "point" ? (
            <div key={f.name} className="flex flex-col gap-1.5 sm:col-span-full">
              <span className="text-sm font-medium">{f.label}</span>
              {renderPoint(f)}
              {result?.fieldErrors?.lat || result?.fieldErrors?.lng ? (
                <span className="text-xs font-medium text-danger">{result.fieldErrors.lat ?? result.fieldErrors.lng}</span>
              ) : f.hint ? (
                <span className="text-xs text-muted-foreground">{f.hint}</span>
              ) : null}
            </div>
          ) : (
            <div key={f.name} className={f.wide ? "sm:col-span-2" : undefined}>
              <Field label={f.label} hint={f.hint} error={result?.fieldErrors?.[f.name]}>
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
          ),
        )}
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
