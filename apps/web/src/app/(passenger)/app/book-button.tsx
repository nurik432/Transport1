"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
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
  const [pending, start] = useTransition();
  const variant = !booked ? "primary" : tone === "ink" ? "inverse" : tone === "quiet" ? "danger-ghost" : "secondary";

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() => start(() => (booked ? cancelBooking(tripId) : bookTrip(tripId, stopId)))}
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
}
