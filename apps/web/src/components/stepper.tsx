"use client";

import { cx } from "./ui";

/**
 * Progress through a short sequence of steps.
 *
 * Only steps already reached are clickable: jumping ahead past something that
 * is not filled in would land on a step whose own inputs do not exist yet.
 */
export function Stepper({
  steps,
  current,
  reached,
  onSelect,
}: {
  steps: readonly string[];
  current: number;
  /** highest step the person has got to so far */
  reached: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((label, i) => {
        const done = i < reached;
        const active = i === current;
        const open = i <= reached;

        return (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => open && onSelect(i)}
              disabled={!open}
              aria-current={active ? "step" : undefined}
              className={cx(
                "inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-[13px] transition-colors",
                active
                  ? "bg-ink font-bold text-on-ink"
                  : open
                    ? "cursor-pointer font-semibold text-body hover:bg-muted"
                    : "font-medium text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                  active ? "bg-on-ink text-ink" : done ? "bg-ok-soft text-ok" : "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <span className="sr-only">{`Шаг ${i + 1} из ${steps.length}: `}</span>
              {label}
            </button>

            {i < steps.length - 1 ? (
              <span aria-hidden="true" className="h-px w-4 bg-divider sm:w-6" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
