import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import type { LoadStatus } from "@transport/domain";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <div id={id} className={cx("rounded-[--radius-card] border border-border bg-card p-4 shadow-xs", className)}>
      {children}
    </div>
  );
}

/**
 * Admin surface: a white block on the grey page, held apart by radius and
 * spacing instead of a border. `tone` draws an inset ring when the block is
 * something the administrator has to act on.
 */
export function Panel({
  tone = "plain",
  className,
  children,
}: {
  tone?: "plain" | "danger" | "warn";
  className?: string;
  children: ReactNode;
}) {
  const rings: Record<"plain" | "danger" | "warn", string> = {
    plain: "",
    danger: "shadow-[inset_0_0_0_2px_var(--color-danger-border)]",
    warn: "shadow-[inset_0_0_0_2px_var(--color-warn-border)]",
  };
  return <div className={cx("rounded-[--radius-panel] bg-card", rings[tone], className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
      {action}
    </div>
  );
}

/** Admin section heading: plain sentence case, sits directly above its block. */
export function PanelTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 id={id} className="text-[17px] font-bold">
        {children}
      </h2>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "inverse" | "quiet";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  secondary: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  /** secondary action next to a primary one on an attention card */
  quiet: "text-primary hover:bg-primary-soft",
  danger: "bg-danger text-white hover:bg-danger/90",
  /** quiet destructive action, e.g. cancelling a booking */
  "danger-ghost": "text-danger hover:bg-danger-soft",
  /** on the dark "ink" trip card */
  inverse: "border border-white/30 text-on-ink hover:bg-white/10",
};

const BUTTON_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60";

type ButtonSize = "sm" | "md" | "lg";

/** Size lives apart from the base so callers never fight it with overrides. */
const BUTTON_SIZES: Record<ButtonSize, string> = {
  /** inside a card or a table row */
  sm: "min-h-9 rounded-lg px-3 text-[13px] font-bold",
  md: "min-h-11 rounded-lg px-4 text-sm font-medium",
  /** the one main action on a passenger screen */
  lg: "min-h-13 rounded-xl px-5 text-base font-bold",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cx(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_STYLES[variant], className)} {...props} />;
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  href,
  children,
  external,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  href: string;
  children: ReactNode;
  /** opens another site or app in a new tab */
  external?: boolean;
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cx(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_STYLES[variant], className)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cx(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_STYLES[variant], className)}>
      {children}
    </Link>
  );
}

/**
 * Load status pill. Shape and text carry the meaning, never colour alone:
 * a triangle up for over capacity, a dot for the norm, a triangle down for
 * an under-used route.
 */
export function StatusPill({ status, note, className }: { status: LoadStatus; note?: string; className?: string }) {
  const map: Record<LoadStatus, { label: string; cls: string; mark: string }> = {
    overloaded: { label: "Перегрузка", cls: "bg-danger-soft text-danger-foreground", mark: "▲" },
    normal: { label: "Норма", cls: "bg-ok-soft text-ok", mark: "●" },
    low: { label: "Низкая", cls: "bg-warn-soft text-warn-foreground", mark: "▼" },
    no_data: { label: "Нет данных", cls: "bg-muted text-muted-foreground", mark: "·" },
  };
  const s = map[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
        s.cls,
        className,
      )}
    >
      <span aria-hidden="true">{s.mark}</span>
      {s.label}
      {note ? <span className="font-semibold">{note}</span> : null}
    </span>
  );
}

/** Neutral pill for a trip status or a short fact in a table row. */
export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "primary" | "ok" | "warn" | "danger" | "ink";
  className?: string;
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-body",
    primary: "bg-primary-soft text-primary",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn-foreground",
    danger: "bg-danger-soft text-danger-foreground",
    ink: "bg-ink text-on-ink",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ROUTE_BADGE_SIZES = {
  sm: "rounded-md px-2 py-0.5 text-sm font-semibold",
  md: "h-8 min-w-9 justify-center rounded-lg px-2 text-base font-extrabold",
  lg: "h-14 min-w-14 justify-center rounded-2xl px-2.5 text-2xl font-extrabold",
} as const;

export function RouteBadge({
  name,
  color,
  size = "sm",
  className,
}: {
  name: string;
  color?: string | null;
  size?: keyof typeof ROUTE_BADGE_SIZES;
  className?: string;
}) {
  return (
    <span
      className={cx("inline-flex shrink-0 items-center text-white", ROUTE_BADGE_SIZES[size], className)}
      style={{ backgroundColor: color ?? "#1f4fd8" }}
    >
      {name}
    </span>
  );
}

/** One number about today: what it is, how big it is, what it sits next to. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[--radius-panel] bg-card p-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-3xl font-extrabold tabular-nums">{value}</span>
      {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** Smaller sibling of the big number, for a suffix such as "из 6". */
export function StatSuffix({ children }: { children: ReactNode }) {
  return <span className="text-base font-semibold text-muted-foreground">{children}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="max-w-xs text-sm text-muted-foreground">{hint}</p> : null}
      {action}
    </Card>
  );
}

/**
 * Horizontal load bar. The fill is always the same colour: the number next to
 * it and the status pill in the same row say whether it is a problem.
 */
export function LoadBar({ pct, className }: { pct: number | null; className?: string }) {
  if (pct === null) return <span className="text-sm text-muted-foreground">—</span>;
  const width = Math.min(100, pct);
  return (
    <div className={cx("flex items-center gap-2.5", className)}>
      <div className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
      <strong className="w-11 shrink-0 text-right text-sm font-bold tabular-nums">{pct}%</strong>
    </div>
  );
}

/** Thin bar used inside a dense table row, e.g. bookings against capacity. */
export function MiniBar({ value, of, className }: { value: number; of: number | null; className?: string }) {
  const pct = of && of > 0 ? Math.min(100, Math.round((value / of) * 100)) : null;
  return (
    <span className={cx("flex items-center gap-2", className)}>
      <span className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-muted">
        {pct === null ? null : <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />}
      </span>
      <span className="shrink-0 tabular-nums">
        {value}
        {of ? `/${of}` : ""}
      </span>
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {error ? <span className="text-xs font-medium text-danger">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-primary";
