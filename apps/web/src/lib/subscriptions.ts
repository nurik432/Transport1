import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { formatMinutes, localNow, validatePause } from "@transport/domain";
import { dropFutureBookings, materializeSubscriptions } from "@transport/db/subscriptions";
import { db, schema } from "./db";

/**
 * Standing bookings ("ride this departure every day"). The passenger screens
 * and the admin panel both go through here, so the rules — one subscription per
 * direction, bookings follow the subscription — live in one place.
 */

const { passengerSubscriptions, passengers, routeSchedules, routeStops, routes, stops, users } = schema;

type Direction = "to_work" | "from_work";

export interface SubscriptionRow {
  id: string;
  passengerId: string;
  scheduleId: string;
  /** "HH:MM" */
  departureTime: string;
  routeId: string;
  routeName: string;
  routeColor: string;
  routeDescription: string | null;
  direction: Direction;
  stopId: string;
  stopName: string;
}

export type SubscriptionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Local date and time the bookings are created against. */
function clock(): { today: string; nowTime: string } {
  const now = localNow();
  return { today: now.date, nowTime: formatMinutes(now.minutes) };
}

/** Subscriptions with everything a screen needs to name them; all passengers when no id is given. */
export async function listSubscriptions(passengerId?: string): Promise<SubscriptionRow[]> {
  const rows = await db
    .select({
      id: passengerSubscriptions.id,
      passengerId: passengerSubscriptions.passengerId,
      scheduleId: passengerSubscriptions.scheduleId,
      departureTime: routeSchedules.departureTime,
      routeId: routes.id,
      routeName: routes.name,
      routeColor: routes.color,
      routeDescription: routes.description,
      direction: routes.direction,
      stopId: passengerSubscriptions.stopId,
      stopName: stops.name,
    })
    .from(passengerSubscriptions)
    .innerJoin(routeSchedules, eq(routeSchedules.id, passengerSubscriptions.scheduleId))
    .innerJoin(routes, eq(routes.id, routeSchedules.routeId))
    .innerJoin(stops, eq(stops.id, passengerSubscriptions.stopId))
    .where(passengerId ? eq(passengerSubscriptions.passengerId, passengerId) : undefined)
    // morning before evening
    .orderBy(asc(routeSchedules.departureTime));
  return rows.map((r) => ({ ...r, departureTime: r.departureTime.slice(0, 5) }));
}

/**
 * Attach a passenger to a departure from a stop.
 *
 * A passenger rides one departure per direction, so another subscription of the
 * same direction is replaced together with the bookings it created. Bookings
 * for the new departure appear on every planned trip straight away.
 */
export async function attachPassenger(input: {
  passengerId: string;
  scheduleId: string;
  stopId: string;
  actorId: string;
}): Promise<SubscriptionResult<{ subscription: SubscriptionRow; replaced: SubscriptionRow | null; created: number }>> {
  const { passengerId, scheduleId, stopId, actorId } = input;

  const target = (
    await db
      .select({
        active: routeSchedules.active,
        routeStatus: routes.status,
        direction: routes.direction,
        versionId: routes.currentVersionId,
      })
      .from(routeSchedules)
      .innerJoin(routes, eq(routes.id, routeSchedules.routeId))
      .where(eq(routeSchedules.id, scheduleId))
      .limit(1)
  )[0];
  if (!target || !target.active || target.routeStatus !== "active" || !target.versionId) {
    return { ok: false, error: "Этот рейс сейчас не ходит" };
  }

  const onRoute = await db
    .select({ id: routeStops.id })
    .from(routeStops)
    .where(and(eq(routeStops.versionId, target.versionId), eq(routeStops.stopId, stopId)))
    .limit(1);
  if (!onRoute[0]) return { ok: false, error: "Этой остановки нет на маршруте" };

  const rider = await db
    .select({ status: users.status })
    .from(passengers)
    .innerJoin(users, eq(users.id, passengers.userId))
    .where(eq(passengers.userId, passengerId))
    .limit(1);
  if (!rider[0]) return { ok: false, error: "Пассажир не найден" };
  if (rider[0].status !== "active") return { ok: false, error: "Доступ пассажира заблокирован" };

  const before = await listSubscriptions(passengerId);
  const replaced = before.find((s) => s.direction === target.direction && s.scheduleId !== scheduleId) ?? null;
  const time = clock();

  const created = await db.transaction(async (tx) => {
    if (replaced) {
      await dropFutureBookings(tx, { passengerId, today: time.today, scheduleIds: [replaced.scheduleId] });
      await tx.delete(passengerSubscriptions).where(eq(passengerSubscriptions.id, replaced.id));
    }
    await tx
      .insert(passengerSubscriptions)
      .values({ passengerId, scheduleId, stopId, createdBy: actorId })
      .onConflictDoUpdate({
        target: [passengerSubscriptions.passengerId, passengerSubscriptions.scheduleId],
        set: { stopId },
      });
    // Bookings already made for this departure move to the subscription's stop;
    // declined days stay declined.
    await dropFutureBookings(tx, { passengerId, today: time.today, scheduleIds: [scheduleId], onlyPlanned: true });
    return materializeSubscriptions(tx, { ...time, passengerId, scheduleIds: [scheduleId] });
  });

  const subscription = (await listSubscriptions(passengerId)).find((s) => s.scheduleId === scheduleId);
  if (!subscription) return { ok: false, error: "Не удалось сохранить привязку" };
  return { ok: true, subscription, replaced, created };
}

/**
 * Detach from a departure and take the upcoming bookings with it.
 * `passengerId` narrows the lookup to the passenger's own subscription.
 */
export async function detachSubscription(subscriptionId: string, passengerId?: string): Promise<SubscriptionRow | null> {
  const row = (
    await db
      .select({ passengerId: passengerSubscriptions.passengerId })
      .from(passengerSubscriptions)
      .where(
        and(
          eq(passengerSubscriptions.id, subscriptionId),
          passengerId ? eq(passengerSubscriptions.passengerId, passengerId) : undefined,
        ),
      )
      .limit(1)
  )[0];
  if (!row) return null;

  const subscription = (await listSubscriptions(row.passengerId)).find((s) => s.id === subscriptionId);
  if (!subscription) return null;

  await db.transaction(async (tx) => {
    await dropFutureBookings(tx, {
      passengerId: subscription.passengerId,
      today: clock().today,
      scheduleIds: [subscription.scheduleId],
    });
    await tx.delete(passengerSubscriptions).where(eq(passengerSubscriptions.id, subscriptionId));
  });
  return subscription;
}

/** Suspend rides for an inclusive range of dates: upcoming bookings inside it are removed. */
export async function setRidePause(passengerId: string, from: string, to: string): Promise<SubscriptionResult> {
  const time = clock();
  const problem = validatePause(from, to, time.today);
  if (problem) return { ok: false, error: problem };

  await db.transaction(async (tx) => {
    await tx.update(passengers).set({ pauseFrom: from, pauseTo: to }).where(eq(passengers.userId, passengerId));
    await dropFutureBookings(tx, { passengerId, today: time.today, from, to, onlyPlanned: true });
    // A pause that was moved or shortened gives back the days it no longer covers.
    await materializeSubscriptions(tx, { ...time, passengerId });
  });
  return { ok: true };
}

/** End the pause now: bookings return on every planned trip of the subscribed departures. */
export async function clearRidePause(passengerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(passengers).set({ pauseFrom: null, pauseTo: null }).where(eq(passengers.userId, passengerId));
    await materializeSubscriptions(tx, { ...clock(), passengerId });
  });
}

/** A blocked passenger no longer rides: subscriptions and upcoming bookings go. */
export async function dropPassengerRides(passengerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(passengerSubscriptions).where(eq(passengerSubscriptions.passengerId, passengerId));
    await dropFutureBookings(tx, { passengerId, today: clock().today });
  });
}

/** Create the bookings for trips that have just been generated. Returns how many were added. */
export async function bookSubscribers(scheduleIds: string[]): Promise<number> {
  return materializeSubscriptions(db, { ...clock(), scheduleIds });
}

/**
 * Remove every subscription matching the filter, with the bookings it created.
 * Used when a departure or a stop leaves a route. Returns what was removed so
 * the caller can tell the passengers.
 */
export async function dropSubscriptions(filter: {
  scheduleIds: string[];
  /** only subscriptions boarding at a stop outside this list */
  keepStopIds?: string[];
}): Promise<SubscriptionRow[]> {
  if (!filter.scheduleIds.length) return [];
  const all = await listSubscriptions();
  const doomed = all.filter(
    (s) => filter.scheduleIds.includes(s.scheduleId) && !(filter.keepStopIds?.includes(s.stopId) ?? false),
  );
  if (!doomed.length) return [];

  const today = clock().today;
  await db.transaction(async (tx) => {
    for (const s of doomed) {
      await dropFutureBookings(tx, { passengerId: s.passengerId, today, scheduleIds: [s.scheduleId] });
    }
    await tx.delete(passengerSubscriptions).where(
      inArray(
        passengerSubscriptions.id,
        doomed.map((s) => s.id),
      ),
    );
  });
  return doomed;
}

/** How many subscriptions `dropSubscriptions` would remove, without removing them. */
export async function countDroppedSubscriptions(filter: { scheduleIds: string[]; keepStopIds?: string[] }): Promise<number> {
  if (!filter.scheduleIds.length) return 0;
  const rows = await db
    .select({ stopId: passengerSubscriptions.stopId })
    .from(passengerSubscriptions)
    .where(inArray(passengerSubscriptions.scheduleId, filter.scheduleIds));
  return rows.filter((r) => !(filter.keepStopIds?.includes(r.stopId) ?? false)).length;
}

/** The passenger's subscription to the departure a trip belongs to, or null. */
export async function tripSubscription(passengerId: string, tripId: string): Promise<{ stopId: string } | null> {
  const rows = await db
    .select({ stopId: passengerSubscriptions.stopId })
    .from(schema.trips)
    .innerJoin(
      passengerSubscriptions,
      and(
        eq(passengerSubscriptions.scheduleId, schema.trips.scheduleId),
        eq(passengerSubscriptions.passengerId, passengerId),
      ),
    )
    .where(eq(schema.trips.id, tripId))
    .limit(1);
  return rows[0] ?? null;
}
