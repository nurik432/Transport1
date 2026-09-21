"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { markAllRead } from "@/lib/queries";

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

/** Cancel the passenger's booking on a trip. */
export async function cancelBooking(tripId: string): Promise<void> {
  const user = await requireRole("passenger");
  await db
    .delete(schema.passengerTrips)
    .where(and(eq(schema.passengerTrips.tripId, tripId), eq(schema.passengerTrips.passengerId, user.id)));
  revalidatePath("/app");
  revalidatePath(`/app/trips/${tripId}`);
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
