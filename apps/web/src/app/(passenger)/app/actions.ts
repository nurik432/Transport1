"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { changeOwnPassword, requireRole } from "@/lib/auth";
import { markAllRead } from "@/lib/queries";
import {
  attachPassenger,
  clearRidePause,
  detachSubscription,
  setRidePause,
  tripSubscription,
} from "@/lib/subscriptions";

/** Book a seat on a trip from a stop (intent, not a hard reservation). */
export async function bookTrip(tripId: string, stopId: string): Promise<void> {
  const user = await requireRole("passenger");

  const trip = await db.select({ status: schema.trips.status }).from(schema.trips).where(eq(schema.trips.id, tripId)).limit(1);
  if (!trip[0] || trip[0].status === "cancelled" || trip[0].status === "completed") return;

  await db
    .insert(schema.passengerTrips)
    .values({ passengerId: user.id, tripId, stopId, status: "planned" })
    .onConflictDoUpdate({
      target: [schema.passengerTrips.passengerId, schema.passengerTrips.tripId],
      set: { stopId, status: "planned" },
    });

  revalidatePath("/app");
  revalidatePath(`/app/trips/${tripId}`);
}

/**
 * Cancel the passenger's booking on a trip.
 *
 * On a subscribed departure the booking is kept as `cancelled` — "not today" —
 * because a deleted row would be created again from the subscription.
 */
export async function cancelBooking(tripId: string): Promise<void> {
  const user = await requireRole("passenger");
  const mine = and(eq(schema.passengerTrips.tripId, tripId), eq(schema.passengerTrips.passengerId, user.id));
  if (await tripSubscription(user.id, tripId)) {
    await db.update(schema.passengerTrips).set({ status: "cancelled" }).where(mine);
  } else {
    await db.delete(schema.passengerTrips).where(mine);
  }
  revalidatePath("/app");
  revalidatePath(`/app/trips/${tripId}`);
}

export interface RideActionResult {
  ok: boolean;
  error?: string;
}

const idSchema = z.string().uuid();

function refreshRides(routeId?: string): void {
  revalidatePath("/app");
  revalidatePath("/app/profile");
  if (routeId) revalidatePath(`/app/routes/${routeId}`);
}

/** Ride this departure from this stop every day it runs, without booking each trip. */
export async function subscribeToDeparture(scheduleId: string, stopId: string): Promise<RideActionResult> {
  const user = await requireRole("passenger");
  if (!idSchema.safeParse(scheduleId).success || !idSchema.safeParse(stopId).success) {
    return { ok: false, error: "Рейс не найден" };
  }
  const result = await attachPassenger({ passengerId: user.id, scheduleId, stopId, actorId: user.id });
  if (!result.ok) return result;
  refreshRides(result.subscription.routeId);
  return { ok: true };
}

/** Stop riding a departure: the subscription and its upcoming bookings are removed. */
export async function unsubscribe(subscriptionId: string): Promise<RideActionResult> {
  const user = await requireRole("passenger");
  if (!idSchema.safeParse(subscriptionId).success) return { ok: false, error: "Привязка не найдена" };
  const removed = await detachSubscription(subscriptionId, user.id);
  if (!removed) return { ok: false, error: "Привязка не найдена" };
  refreshRides(removed.routeId);
  return { ok: true };
}

/** "I am away from … to …": no bookings are made for these dates. */
export async function pauseRides(from: string, to: string): Promise<RideActionResult> {
  const user = await requireRole("passenger");
  const result = await setRidePause(user.id, from, to);
  if (!result.ok) return result;
  refreshRides();
  return { ok: true };
}

export async function resumeRides(): Promise<RideActionResult> {
  const user = await requireRole("passenger");
  await clearRidePause(user.id);
  refreshRides();
  return { ok: true };
}

/** Add or remove a favorite route or stop. */
export async function toggleFavorite(kind: "route" | "stop", id: string): Promise<void> {
  const user = await requireRole("passenger");
  const column = kind === "route" ? schema.passengerFavorites.routeId : schema.passengerFavorites.stopId;

  const existing = await db
    .select({ id: schema.passengerFavorites.id })
    .from(schema.passengerFavorites)
    .where(and(eq(schema.passengerFavorites.passengerId, user.id), eq(column, id)))
    .limit(1);

  if (existing[0]) {
    await db.delete(schema.passengerFavorites).where(eq(schema.passengerFavorites.id, existing[0].id));
  } else {
    await db.insert(schema.passengerFavorites).values({
      passengerId: user.id,
      routeId: kind === "route" ? id : null,
      stopId: kind === "stop" ? id : null,
    });
  }
  revalidatePath("/app");
  revalidatePath("/app/routes");
  revalidatePath(`/app/routes/${id}`);
}

/** Update the passenger's home address used when geolocation is unavailable. */
export async function saveHome(address: string, lat: number | null, lng: number | null): Promise<void> {
  const user = await requireRole("passenger");
  await db
    .update(schema.passengers)
    .set({ homeAddress: address || null, lat, lng })
    .where(eq(schema.passengers.userId, user.id));
  revalidatePath("/app/profile");
  revalidatePath("/app");
}

/** Mark the passenger's notifications as read. */
export async function readNotifications(): Promise<void> {
  const user = await requireRole("passenger");
  await markAllRead(user.id);
  revalidatePath("/app/notifications");
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await requireRole("passenger");
  return changeOwnPassword(currentPassword, newPassword);
}
