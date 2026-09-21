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
}: {
  tripId: string;
  stopId: string;
  booked: boolean;
  className?: string;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      variant={booked ? "secondary" : "primary"}
      className={className}
      disabled={pending}
      onClick={() => start(() => (booked ? cancelBooking(tripId) : bookTrip(tripId, stopId)))}
    >
      {booked ? (
        <>
          <IconCheck className="size-4" />
          Поеду — отменить
        </>
      ) : (
        "Поеду"
      )}
    </Button>
  );
}
