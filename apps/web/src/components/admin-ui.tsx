import type { ReactNode } from "react";
import Link from "next/link";
import { cx } from "./ui";

/**
 * Admin page shell. The screen is a working surface, not a document: content
 * runs the full width of the window and only the outer padding holds it off
 * the edge.
 */
export function AdminMain({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx("flex w-full flex-col gap-5 px-4 py-6 lg:px-8 lg:py-7", className)}>{children}</main>;
}

/**
 * Shell for a screen that fills the viewport instead of scrolling, such as the
 * live map. No padding: the children own the whole area.
 */
export function AdminFull({ children, label }: { children: ReactNode; label: string }) {
  return (
    <main aria-label={label} className="flex min-h-dvh w-full min-w-0 lg:h-dvh">
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  badge,
  action,
}: {
  title: ReactNode;
  /** small line above the title: the date, the period, the section */
  eyebrow?: ReactNode;
  /** small line below the title: what the screen is for */
  description?: ReactNode;
  /** sits inside the title line, e.g. a route badge */
  badge?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <p className="text-sm text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="flex items-center gap-3 text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
          {badge}
          {title}
        </h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

/**
 * Data table. Sits on the page as a white block with a tinted head row and
 * hairline dividers; the outer border is replaced by the radius.
 */
export function Table({
  head,
  children,
  minWidth = "44rem",
}: {
  head: ReactNode[];
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-[--radius-panel] bg-card">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr className="bg-muted text-left">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-xs font-bold whitespace-nowrap text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({
  children,
  className,
  tone = "plain",
}: {
  children: ReactNode;
  className?: string;
  /** "attention" marks a row the administrator still has to finish */
  tone?: "plain" | "attention";
}) {
  return (
    <tr
      className={cx(
        "border-b border-divider last:border-b-0",
        tone === "attention" ? "bg-attention" : "hover:bg-muted/40",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cx("h-13 px-4 align-middle", className)}>{children}</td>;
}

export interface FilterChip {
  key: string;
  label: string;
  count?: number;
  href: string;
  /** draws the chip as something still waiting for the administrator */
  attention?: boolean;
}

/** Row of filter chips that double as counters: the count is the reason to click. */
export function FilterChips({ chips, active, label }: { chips: FilterChip[]; active: string; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {chips.map((c) => {
        const selected = c.key === active;
        return (
          <Link
            key={c.key}
            href={c.href}
            role="tab"
            aria-selected={selected}
            className={cx(
              "inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] transition-colors",
              selected
                ? "border-ink bg-ink font-bold text-on-ink"
                : c.attention
                  ? "border-warn-border bg-highlight-soft font-bold text-warn-foreground hover:bg-warn-soft"
                  : "border-border bg-card font-semibold text-body hover:bg-muted",
            )}
          >
            {c.label}
            {c.count === undefined ? null : <span className="ml-1.5 tabular-nums">· {c.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}

/** Segmented control on a tinted track, for a short list of mutually exclusive views. */
export function Segmented({
  items,
  active,
  label,
  onSelect,
}: {
  items: { key: string; label: string; count?: number }[];
  active: string;
  label: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="grid grid-flow-col gap-1 rounded-xl bg-muted p-1">
      {items.map((i) => {
        const selected = i.key === active;
        return (
          <button
            key={i.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(i.key)}
            className={cx(
              "min-h-9 cursor-pointer rounded-lg px-2 text-[13px] transition-colors",
              selected ? "bg-card font-bold" : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {i.label}
            {i.count === undefined ? null : <span className="tabular-nums"> · {i.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
