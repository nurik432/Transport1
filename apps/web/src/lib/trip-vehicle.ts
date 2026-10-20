import "server-only";
import { sql } from "drizzle-orm";
import { departureLabel } from "@transport/domain";
import { schema } from "./db";

/**
 * Several vehicles may leave a route at the same time. Each is its own trip
 * made from its own schedule row, and people tell them apart by the vehicle
 * number within the departure. These fragments read that for a row of `trips`
 * in any query, so every screen names a trip the same way.
 */

const { trips } = schema;

/** Which vehicle of its departure time the trip is; pinned on the trip when it is made. */
export const tripVehicleNo = trips.vehicleNo;

/**
 * How many trips leave the same route at the same time on the same day.
 *
 * The outer row is named `trips` explicitly: in a query without joins drizzle
 * prints columns without their table, and inside this subquery a bare
 * "route_id" would mean the inner row and match everything.
 */
export const tripVehiclesAtTime = sql<number>`(
  select count(*) from ${trips} t_vat
  where t_vat.route_id = "trips"."route_id" and t_vat.date = "trips"."date" and t_vat.start_time = "trips"."start_time"
)`.mapWith(Number);

/** "07:30", or "07:30 · машина 2" when other vehicles leave at the same time. */
export function tripLabel(trip: { startTime: string; vehicleNo: number; vehiclesAtTime: number }): string {
  return departureLabel(trip.startTime, trip.vehicleNo, trip.vehiclesAtTime);
}
