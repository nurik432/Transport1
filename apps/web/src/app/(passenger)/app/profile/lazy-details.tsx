"use client";

import { useState, type ReactNode } from "react";

/** A <details> whose body mounts on first open: a map needs a visible box to size itself. */
export function LazyDetails({
  open: initiallyOpen,
  className,
  summary,
  children,
}: {
  open: boolean;
  className?: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(initiallyOpen);
  return (
    <details className={className} open={initiallyOpen} onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      {summary}
      {opened ? children : null}
    </details>
  );
}
