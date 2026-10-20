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
      -- the passenger already chose another vehicle leaving at the same time that day
      and not exists (
        select 1 from passenger_trips pt_sib
        join trips t_sib on t_sib.id = pt_sib.trip_id
        where pt_sib.passenger_id = ${passengerSubscriptions.passengerId}
          and pt_sib.status <> 'cancelled'
          and t_sib.id <> ${trips.id}
          and t_sib.route_id = ${trips.routeId}
          and t_sib.date = ${trips.date}
          and t_sib.start_time = ${trips.startTime}
      )
      ${opts.passengerId ? sql`and ${passengerSubscriptions.passengerId} = ${opts.passengerId}` : sql``}
      ${opts.scheduleIds ? sql`and ${inArray(passengerSubscriptions.scheduleId, opts.scheduleIds)}` : sql``}
    on conflict ("passenger_id", "trip_id") do nothing
    returning "trip_id"
  `);
  return created.length;
}

/**
 * Several vehicles may leave a route at the same time, and a passenger rides
 * one of them. Booking a trip removes the passenger's upcoming booking on the
 * other vehicles of that departure. A booking the passenger's subscription made
 * is kept as `cancelled` ("not this one today"), or it would be made again.
 */
export async function dropSiblingBookings(db: DbOrTx, opts: { passengerId: string; tripId: string }): Promise<void> {
  const siblings = sql`
    select sib.id from trips sib join trips me on me.id = ${opts.tripId}
    where sib.id <> me.id and sib.route_id = me.route_id and sib.date = me.date and sib.start_time = me.start_time
  `;
  await db.execute(sql`
    update ${passengerTrips} set "status" = 'cancelled'
    where ${passengerTrips.passengerId} = ${opts.passengerId}
      and ${passengerTrips.status} = 'planned'
      and ${passengerTrips.tripId} in (${siblings})
      and exists (
        select 1 from ${passengerSubscriptions} ps join trips t on t.schedule_id = ps.schedule_id
        where ps.passenger_id = ${opts.passengerId} and t.id = ${passengerTrips.tripId}
      )
  `);
  await db.execute(sql`
    delete from ${passengerTrips}
    where ${passengerTrips.passengerId} = ${opts.passengerId}
      and ${passengerTrips.status} = 'planned'
      and ${passengerTrips.tripId} in (${siblings})
  `);
}

/**
 * Before a subscription to one vehicle takes effect, remove the passenger's
 * one-off bookings on the other vehicles of the same departure, on trips that
 * have not run yet. Otherwise they would hold a seat in two buses at once.
 */
export async function dropSiblingBookingsForSchedule(
  db: DbOrTx,
  opts: { passengerId: string; scheduleId: string; today: string },
): Promise<void> {
  await db.execute(sql`
    delete from ${passengerTrips}
    where ${passengerTrips.passengerId} = ${opts.passengerId}
      and ${passengerTrips.status} = 'planned'
      and ${passengerTrips.tripId} in (
        select sib.id from trips sib
        join trips mine on mine.schedule_id = ${opts.scheduleId}
          and mine.route_id = sib.route_id and mine.date = sib.date and mine.start_time = sib.start_time
        where sib.id <> mine.id and sib.status = 'planned' and sib.date >= ${opts.today}
      )
  `);
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
