import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import type { LoadStatus } from "@transport/domain";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-[--radius-card] border border-border bg-card p-4 shadow-xs", className)}>{children}</div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "inverse";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-blue-700",
  secondary: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "bg-danger text-white hover:bg-red-700",
  /** quiet destructive action, e.g. "Отменить" next to a booking */
  "danger-ghost": "text-danger hover:bg-danger-soft",
  /** on the dark "ink" trip card */
  inverse: "border border-white/30 text-on-ink hover:bg-white/10",
};

const BUTTON_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60";

type ButtonSize = "md" | "lg";

/** Size lives apart from the base so callers never fight it with overrides. */
const BUTTON_SIZES: Record<ButtonSize, string> = {
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

/** Load status pill. Uses shape + text, never colour alone. */
export function StatusPill({ status, className }: { status: LoadStatus; className?: string }) {
  const map: Record<LoadStatus, { label: string; cls: string; dot: string }> = {
    overloaded: { label: "Перегрузка", cls: "bg-danger-soft text-red-800", dot: "bg-danger" },
    normal: { label: "Норма", cls: "bg-ok-soft text-green-800", dot: "bg-ok" },
    low: { label: "Низкая загрузка", cls: "bg-warn-soft text-yellow-800", dot: "bg-warn" },
    no_data: { label: "Нет данных", cls: "bg-muted text-muted-foreground", dot: "bg-slate-400" },
  };
  const s = map[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", s.cls, className)}>
      <span className={cx("size-1.5 shrink-0 rounded-full", s.dot)} aria-hidden="true" />
      {s.label}
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

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </Card>
  );
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

/** Horizontal load bar; overload is shown with a distinct fill and a label. */
export function LoadBar({ pct, className }: { pct: number | null; className?: string }) {
  if (pct === null) return <span className="text-sm text-muted-foreground">—</span>;
  const width = Math.min(100, pct);
  const tone = pct >= 100 ? "bg-danger" : pct < 40 ? "bg-warn" : "bg-ok";
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <div className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${width}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">{pct}%</span>
    </div>
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
