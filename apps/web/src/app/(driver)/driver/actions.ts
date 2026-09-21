"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/** Load a trip and check it belongs to the signed-in driver. */
async function ownedTrip(tripId: string) {
  const user = await requireRole("driver");
  const rows = await db
    .select({ id: schema.trips.id, routeId: schema.trips.routeId, status: schema.trips.status, driverId: schema.trips.driverId })
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId))
    .limit(1);
  const trip = rows[0];
  if (!trip || trip.driverId !== user.id) throw new Error("Рейс не найден");
  return trip;
}

function refresh(tripId: string) {
  revalidatePath("/driver");
  revalidatePath(`/driver/trips/${tripId}`);
  revalidatePath(`/app/trips/${tripId}`);
  revalidatePath("/app");
}

export async function startTrip(tripId: string): Promise<void> {
  const trip = await ownedTrip(tripId);
  if (trip.status !== "planned") return;
  await db.update(schema.trips).set({ status: "in_progress", startedAt: new Date() }).where(eq(schema.trips.id, tripId));
  refresh(tripId);
}

/** Mark arrival at a stop. Idempotent: a second press does not reset the time. */
export async function markArrival(tripId: string, stopId: string): Promise<void> {
  const trip = await ownedTrip(tripId);
  if (trip.status !== "in_progress") return;
  await db
    .insert(schema.tripStopEvents)
    .values({ tripId, stopId, arrivedAt: new Date() })
    .onConflictDoNothing({ target: [schema.tripStopEvents.tripId, schema.tripStopEvents.stopId] });
  refresh(tripId);
}

/** Set how many passengers boarded and alighted at a stop. */
export async function setHeadcount(tripId: string, stopId: string, boarded: number, alighted: number): Promise<void> {
  const trip = await ownedTrip(tripId);
  if (trip.status !== "in_progress") return;
  const safe = (n: number) => Math.max(0, Math.min(200, Math.round(Number.isFinite(n) ? n : 0)));
  await db
    .insert(schema.tripStopEvents)
    .values({ tripId, stopId, arrivedAt: new Date(), boarded: safe(boarded), alighted: safe(alighted) })
    .onConflictDoUpdate({
      target: [schema.tripStopEvents.tripId, schema.tripStopEvents.stopId],
      set: { boarded: safe(boarded), alighted: safe(alighted) },
    });
  refresh(tripId);
}

/** Leave a stop: records departure time, which sharpens ETA for the next stops. */
export async function departStop(tripId: string, stopId: string): Promise<void> {
  const trip = await ownedTrip(tripId);
  if (trip.status !== "in_progress") return;
  await db
    .update(schema.tripStopEvents)
    .set({ departedAt: new Date() })
    .where(and(eq(schema.tripStopEvents.tripId, tripId), eq(schema.tripStopEvents.stopId, stopId)));
  refresh(tripId);
}

/** Finish the trip and convert bookings into ridden trips. */
export async function finishTrip(tripId: string): Promise<void> {
  const trip = await ownedTrip(tripId);
  if (trip.status !== "in_progress") return;
  await db.update(schema.trips).set({ status: "completed", finishedAt: new Date() }).where(eq(schema.trips.id, tripId));
  await db
    .update(schema.passengerTrips)
    .set({ status: "boarded" })
    .where(and(eq(schema.passengerTrips.tripId, tripId), ne(schema.passengerTrips.status, "cancelled")));
  refresh(tripId);
}
