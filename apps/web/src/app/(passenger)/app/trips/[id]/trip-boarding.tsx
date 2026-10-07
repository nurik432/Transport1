"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { IconBus, IconCheck } from "@/components/icons";
import { BookButton } from "../../book-button";
import { TripLivePanel, type LiveStop, type TripStatus } from "./live-panel";

/**
 * Trip timeline with the booking card. The boarding stop defaults to the booked
 * one (otherwise the next stop), and any stop still ahead can be picked by
 * tapping it in the list or on the map — no geolocation needed.
 */
export function TripBoarding({
  tripId,
  status,
  stops,
  routeName,
  routeColor,
  routeLine,
  bookedStopId,
  defaultStopId,
  standing = false,
  seatsLine,
  vehicle,
}: {
  tripId: string;
  status: TripStatus;
  stops: LiveStop[];
  routeName: string;
  routeColor: string;
  routeLine?: [number, number][] | null;
  bookedStopId?: string;
  /** preselected when nothing is booked */
  defaultStopId?: string;
  /** the passenger has a standing booking for this departure */
  standing?: boolean;
  seatsLine: string | null;
  vehicle: { model: string; number: string } | null;
}) {
  const open = status === "planned" || status === "in_progress";
  const [picked, setPicked] = useState(bookedStopId ?? defaultStopId);
  // A booking made elsewhere on the screen (walking directions) becomes the pick.
  const [seenBooked, setSeenBooked] = useState(bookedStopId);
  if (bookedStopId !== seenBooked) {
    setSeenBooked(bookedStopId);
    if (bookedStopId) setPicked(bookedStopId);
  }

  const booked = stops.find((s) => s.stopId === bookedStopId);
  // A picked stop the vehicle has since passed can't be boarded; fall back.
  const chosen =
    stops.find((s) => s.stopId === picked && (s.stopId === bookedStopId || !s.arrivedAt)) ??
    booked ??
    stops.find((s) => s.stopId === defaultStopId);

  return (
    <TripLivePanel
      tripId={tripId}
      status={status}
      routeName={routeName}
      routeColor={routeColor}
      routeLine={routeLine}
      myStopId={bookedStopId}
      pickedStopId={open ? chosen?.stopId : undefined}
      onPickStop={open ? setPicked : undefined}
      stops={stops}
    >
      {open && booked && chosen?.stopId === booked.stopId ? (
        <section aria-label="Ваша поездка" className="flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
            <IconCheck className="size-4.5" />
          </span>
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <strong>Вы едете</strong> с «{booked.name}»{standing ? " · постоянный рейс" : ""}
            {seatsLine ? <span className="block text-muted-foreground">{seatsLine}</span> : null}
          </p>
          <BookButton
            tripId={tripId}
            stopId={booked.stopId}
            booked
            cancelLabel={standing ? "Не поеду в этот день" : "Отменить"}
            tone="quiet"
          />
        </section>
      ) : open && booked && chosen ? (
        <section aria-label="Смена остановки" className="flex flex-col gap-2 rounded-2xl bg-card p-3.5">
          <p className="text-sm text-muted-foreground">Сейчас вы едете с «{booked.name}»</p>
          <BookButton
            key={chosen.stopId}
            tripId={tripId}
            stopId={chosen.stopId}
            booked={false}
            bookLabel={`Садиться на «${chosen.name}»`}
            size="lg"
            className="w-full"
          />
          <Button variant="ghost" className="w-full" onClick={() => setPicked(booked.stopId)}>
            Оставить «{booked.name}»
          </Button>
        </section>
      ) : open && chosen ? (
        <section aria-label="Бронь" className="flex flex-col gap-2 rounded-2xl bg-card p-3.5">
          {seatsLine ? <p className="text-sm text-muted-foreground">{seatsLine}</p> : null}
          {standing ? (
            <p className="text-sm text-muted-foreground">
              В этот день вы не едете. Привязка к рейсу сохраняется — в остальные дни отметка ставится сама.
            </p>
          ) : null}
          <BookButton
            key={chosen.stopId}
            tripId={tripId}
            stopId={chosen.stopId}
            booked={false}
            bookLabel={`Поеду с «${chosen.name}»`}
            size="lg"
            className="w-full"
          />
        </section>
      ) : null}

      {vehicle ? (
        <p className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
          <IconBus className="size-4" />
          {vehicle.model}, {vehicle.number}
        </p>
      ) : null}
    </TripLivePanel>
  );
}
