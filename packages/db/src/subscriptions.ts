/**
 * Standing bookings turned into per-trip bookings.
 *
 * Trips exist only once an administrator generates them, so a subscription
 * cannot be a row per day up front. Instead every place that creates trips or
 * changes a subscription calls `materializeSubscriptions`, and everything that
 * counts demand keeps reading `passenger_trips` as before.
 */
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "./client";
import * as schema from "./schema";

/** The database or a transaction on it. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const { passengerSubscriptions, passengerTrips, passengers, routeStops, routes, trips, users } = schema;

export interface MaterializeOptions {
  /** local date, YYYY-MM-DD */
  today: string;
  /** local time "HH:MM"; today's trips that already left are skipped */
  nowTime: string;
  passengerId?: string;
  scheduleIds?: string[];
}

/**
 * Create the missing bookings for planned trips of subscribed departures.
 *
 * Idempotent. A day the passenger declined stays declined: its `cancelled` row
 * already occupies (passenger, trip) and the insert skips it. Paused dates,
 * blocked users and trips whose shape no longer has the stop are left out.
 * Returns the number of bookings created.
 */
export async function materializeSubscriptions(db: DbOrTx, opts: MaterializeOptions): Promise<number> {
  if (opts.scheduleIds && opts.scheduleIds.length === 0) return 0;

  const created = await db.execute(sql`
    insert into ${passengerTrips} ("passenger_id", "trip_id", "stop_id", "status")
    select ${passengerSubscriptions.passengerId}, ${trips.id}, ${passengerSubscriptions.stopId}, 'planned'
    from ${passengerSubscriptions}
    join ${trips} on ${trips.scheduleId} = ${passengerSubscriptions.scheduleId}
    join ${routes} on ${routes.id} = ${trips.routeId}
    join ${users} on ${users.id} = ${passengerSubscriptions.passengerId}
    join ${passengers} on ${passengers.userId} = ${passengerSubscriptions.passengerId}
    where ${trips.status} = 'planned'
      and (${trips.date} > ${opts.today} or (${trips.date} = ${opts.today} and ${trips.startTime} >= ${opts.nowTime}))
      and ${users.status} = 'active'
      and not (
        ${passengers.pauseFrom} is not null and ${passengers.pauseTo} is not null
        and ${trips.date} between ${passengers.pauseFrom} and ${passengers.pauseTo}
      )
      and exists (
        select 1 from ${routeStops}
        where ${routeStops.versionId} = coalesce(${trips.routeVersionId}, ${routes.currentVersionId})
          and ${routeStops.stopId} = ${passengerSubscriptions.stopId}
      )
      ${opts.passengerId ? sql`and ${passengerSubscriptions.passengerId} = ${opts.passengerId}` : sql``}
      ${opts.scheduleIds ? sql`and ${inArray(passengerSubscriptions.scheduleId, opts.scheduleIds)}` : sql``}
    on conflict ("passenger_id", "trip_id") do nothing
    returning "trip_id"
  `);
  return created.length;
}

export interface DropBookingsOptions {
  passengerId: string;
  /** local date; bookings before it are history and stay */
  today: string;
  /** only trips of these departures */
  scheduleIds?: string[];
  /** only trips inside this inclusive date range */
  from?: string;
  to?: string;
  /** keep the days the passenger declined (`cancelled`) so they stay declined */
  onlyPlanned?: boolean;
}

/** Remove a passenger's bookings on trips that have not run yet. */
export async function dropFutureBookings(db: DbOrTx, opts: DropBookingsOptions): Promise<void> {
  if (opts.scheduleIds && opts.scheduleIds.length === 0) return;
  const from = opts.from && opts.from > opts.today ? opts.from : opts.today;

  const upcoming = db
    .select({ id: trips.id })
    .from(trips)
    .where(
      and(
        eq(trips.status, "planned"),
        gte(trips.date, from),
        opts.to ? lte(trips.date, opts.to) : undefined,
        opts.scheduleIds ? inArray(trips.scheduleId, opts.scheduleIds) : undefined,
      ),
    );

  await db
    .delete(passengerTrips)
    .where(
      and(
        eq(passengerTrips.passengerId, opts.passengerId),
        inArray(passengerTrips.tripId, upcoming),
        opts.onlyPlanned ? eq(passengerTrips.status, "planned") : undefined,
      ),
    );
}
