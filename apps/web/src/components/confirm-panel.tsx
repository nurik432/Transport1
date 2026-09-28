"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, Panel } from "./ui";

/**
 * Inline confirmation, in the place of the button that asked for it.
 *
 * Not a modal: the project has no dialog component, and a correct one needs a
 * focus trap, an inert background, focus return and Escape — work with real
 * risk of being done badly. Not `window.confirm` either: that cannot show five
 * lines of consequences, which is the entire point here.
 */
export function ConfirmPanel({
  title,
  children,
  confirmLabel,
  cancelLabel = "Отмена",
  onConfirm,
  onCancel,
  pending = false,
  tone = "warn",
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  tone?: "warn" | "danger";
}) {
  const titleId = useId();
  const headingRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus();
    heading.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div role="group" aria-labelledby={titleId}>
      <Panel tone={tone} className="flex flex-col gap-3 p-4">
        <p id={titleId} ref={headingRef} tabIndex={-1} className="text-[17px] font-bold outline-none">
          {title}
        </p>

        <div className="flex flex-col gap-1.5 text-sm">{children}</div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onConfirm} disabled={pending} variant={tone === "danger" ? "danger" : "primary"}>
            {pending ? "Сохранение…" : confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
