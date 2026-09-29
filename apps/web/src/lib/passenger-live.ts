import "server-only";
import { and, eq, gte, ne } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * Passenger positions for the driver. A passenger shares by their own choice,
 * only on a trip they booked and only while it is running; one row per passenger
 * is overwritten, and the rows go when the trip ends.
 */

/** A point older than this is not shown: the passenger stopped sharing or lost signal. */
export const PASSENGER_FRESH_MS = 2 * 60_000;

export type SharePositionResult = { ok: true } | { ok: false; error: string; code: "not_booked" | "not_running" };

async function bookingOn(tripId: string, passengerId: string) {
  const rows = await db
    .select({ status: schema.trips.status })
    .from(schema.passengerTrips)
    .innerJoin(schema.trips, eq(schema.trips.id, schema.passengerTrips.tripId))
    .where(
      and(
        eq(schema.passengerTrips.tripId, tripId),
        eq(schema.passengerTrips.passengerId, passengerId),
        ne(schema.passengerTrips.status, "cancelled"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function recordPassengerPosition(input: {
  tripId: string;
  passengerId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
}): Promise<SharePositionResult> {
  const booking = await bookingOn(input.tripId, input.passengerId);
  if (!booking) return { ok: false, code: "not_booked", error: "Вы не записаны на этот рейс" };
  if (booking.status !== "in_progress") return { ok: false, code: "not_running", error: "Рейс не в пути" };

  const recordedAt = new Date();
  await db
    .insert(schema.passengerPositions)
    .values({ ...input, recordedAt })
    .onConflictDoUpdate({
      target: [schema.passengerPositions.tripId, schema.passengerPositions.passengerId],
      set: { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM, recordedAt },
    });
  return { ok: true };
}

export async function stopSharingPosition(tripId: string, passengerId: string): Promise<void> {
  await db
    .delete(schema.passengerPositions)
    .where(and(eq(schema.passengerPositions.tripId, tripId), eq(schema.passengerPositions.passengerId, passengerId)));
}

export async function clearPassengerPositions(tripId: string): Promise<void> {
  await db.delete(schema.passengerPositions).where(eq(schema.passengerPositions.tripId, tripId));
}

export interface PassengerOnMap {
  passengerId: string;
  name: string;
  stopName: string;
  lat: number;
  lng: number;
  recordedAt: string;
}

/** Fresh positions of passengers still booked on a running trip. */
export async function getPassengerPositions(tripId: string, now = new Date()): Promise<PassengerOnMap[]> {
  const rows = await db
    .select({
      passengerId: schema.passengerPositions.passengerId,
      name: schema.users.name,
      stopName: schema.stops.name,
      lat: schema.passengerPositions.lat,
      lng: schema.passengerPositions.lng,
      recordedAt: schema.passengerPositions.recordedAt,
    })
    .from(schema.passengerPositions)
    .innerJoin(schema.trips, eq(schema.trips.id, schema.passengerPositions.tripId))
    .innerJoin(
      schema.passengerTrips,
      and(
        eq(schema.passengerTrips.tripId, schema.passengerPositions.tripId),
        eq(schema.passengerTrips.passengerId, schema.passengerPositions.passengerId),
      ),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.passengerPositions.passengerId))
    .innerJoin(schema.stops, eq(schema.stops.id, schema.passengerTrips.stopId))
    .where(
      and(
        eq(schema.passengerPositions.tripId, tripId),
        eq(schema.trips.status, "in_progress"),
        eq(schema.passengerTrips.status, "planned"),
        gte(schema.passengerPositions.recordedAt, new Date(now.getTime() - PASSENGER_FRESH_MS)),
      ),
    );
  return rows.map((r) => ({ ...r, recordedAt: r.recordedAt.toISOString() }));
}
