"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { subscribeToDeparture, unsubscribe, type RideActionResult } from "./actions";

/** Runs a ride action and keeps its refusal on screen next to the button. */
function useRideAction(): { pending: boolean; error: string | null; run: (action: () => Promise<RideActionResult>) => void } {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<RideActionResult>) =>
    start(async () => {
      const result = await action();
      setError(result.ok ? null : (result.error ?? "Не удалось сохранить"));
    });
  return { pending, error, run };
}

function ActionError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-danger">
      {error}
    </p>
  ) : null;
}

/** "Ride this departure every day": one tap instead of booking each trip. */
export function SubscribeButton({
  scheduleId,
  stopId,
  label,
  variant = "secondary",
  size = "lg",
}: {
  scheduleId: string;
  stopId: string;
  label: string;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
}) {
  const { pending, error, run } = useRideAction();
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant={variant}
        size={size}
        className="w-full"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => run(() => subscribeToDeparture(scheduleId, stopId))}
      >
        {label}
      </Button>
      <ActionError error={error} />
    </div>
  );
}

export function UnsubscribeButton({ subscriptionId, label = "Отвязаться" }: { subscriptionId: string; label?: string }) {
  const { pending, error, run } = useRideAction();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        variant="danger-ghost"
        size="sm"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => run(() => unsubscribe(subscriptionId))}
      >
        {label}
      </Button>
      <ActionError error={error} />
    </span>
  );
}
