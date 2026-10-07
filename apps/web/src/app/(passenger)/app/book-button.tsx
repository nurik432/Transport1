"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, cx } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { bookTrip, cancelBooking } from "./actions";

export function BookButton({
  tripId,
  stopId,
  booked,
  className,
  bookLabel = "Поеду",
  cancelLabel,
  tone = "default",
  size = "md",
}: {
  tripId: string;
  stopId: string;
  booked: boolean;
  className?: string;
  /** text on the booking button */
  bookLabel?: string;
  /** text on the cancel button; defaults to "Поеду — отменить" with a check */
  cancelLabel?: string;
  /** "ink" sits on the dark active-trip card; "quiet" is a red text button */
  tone?: "default" | "ink" | "quiet";
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const variant = !booked ? "primary" : tone === "ink" ? "inverse" : tone === "quiet" ? "danger-ghost" : "secondary";

  function toggle() {
    setError(undefined);
    start(async () => {
      try {
        const res = booked ? await cancelBooking(tripId) : await bookTrip(tripId, stopId);
        if ("error" in res) setError(res.error);
        else router.refresh();
      } catch {
        setError("Не удалось сохранить. Проверьте связь и попробуйте ещё раз");
      }
    });
  }

  const button = (
    <Button
      variant={variant}
      size={size}
      className={error ? "w-full" : className}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={toggle}
    >
      {booked ? (
        cancelLabel ?? (
          <>
            <IconCheck className="size-4" />
            Поеду — отменить
          </>
        )
      ) : (
        bookLabel
      )}
    </Button>
  );
  if (!error) return button;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {button}
      <p role="alert" className={cx("text-sm font-medium", tone === "ink" ? "text-on-ink" : "text-danger")}>
        {error}
      </p>
    </div>
  );
}
