import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const userRole = pgEnum("user_role", ["passenger", "driver", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "blocked"]);
export const driverStatus = pgEnum("driver_status", ["active", "inactive"]);
export const vehicleStatus = pgEnum("vehicle_status", ["active", "repair", "inactive"]);
export const routeDirection = pgEnum("route_direction", ["to_work", "from_work"]);
export const routeStatus = pgEnum("route_status", ["draft", "active", "inactive"]);
export const stopStatus = pgEnum("stop_status", ["active", "inactive"]);
export const tripStatus = pgEnum("trip_status", ["planned", "in_progress", "completed", "cancelled"]);
export const passengerTripStatus = pgEnum("passenger_trip_status", ["planned", "boarded", "missed", "cancelled"]);
export const notificationType = pgEnum("notification_type", [
  "route_changed",
  "schedule_changed",
  "trip_delayed",
  "trip_cancelled",
  "vehicle_approaching",
  "new_route",
  "admin_message",
  "route_overloaded",
  "route_underloaded",
]);

// ---------- Users & auth ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    role: userRole("role").notNull(),
    status: userStatus("status").notNull().default("active"),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_phone_idx").on(t.phone)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // random token
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passengers = pgTable("passengers", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  homeAddress: text("home_address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  department: text("department"),
});

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    model: text("model").notNull(),
    capacity: integer("capacity").notNull(),
    status: vehicleStatus("status").notNull().default("active"),
  },
  (t) => [uniqueIndex("vehicles_number_idx").on(t.number)],
);

export const drivers = pgTable("drivers", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  status: driverStatus("status").notNull().default("active"),
});

// ---------- Network: stops, routes, schedules ----------

export const stops = pgTable("stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  address: text("address"),
  status: stopStatus("status").notNull().default("active"),
});

export const routes = pgTable("routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // "№5"
  description: text("description"),
  direction: routeDirection("direction").notNull(),
  status: routeStatus("status").notNull().default("active"),
  plannedCapacity: integer("planned_capacity"),
  color: text("color").notNull().default("#2563eb"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routeStops = pgTable(
  "route_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => stops.id, { onDelete: "restrict" }),
    seq: integer("seq").notNull(), // 1-based order
    offsetMin: integer("offset_min").notNull(), // minutes from departure
  },
  (t) => [
    uniqueIndex("route_stops_route_seq_idx").on(t.routeId, t.seq),
    uniqueIndex("route_stops_route_stop_idx").on(t.routeId, t.stopId),
  ],
);

export const routeSchedules = pgTable(
  "route_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    departureTime: time("departure_time").notNull(),
    // ISO weekday numbers: 1 = Monday ... 7 = Sunday
    daysOfWeek: integer("days_of_week")
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5}'::integer[]`),
    active: boolean("active").notNull().default(true),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
  },
  (t) => [uniqueIndex("route_schedules_route_time_idx").on(t.routeId, t.departureTime)],
);

// ---------- Operations: trips & facts ----------

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => routeSchedules.id, { onDelete: "set null" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    driverId: uuid("driver_id").references(() => drivers.userId, { onDelete: "set null" }),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    status: tripStatus("status").notNull().default("planned"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trips_route_date_time_idx").on(t.routeId, t.date, t.startTime),
    index("trips_date_idx").on(t.date),
    index("trips_driver_date_idx").on(t.driverId, t.date),
  ],
);

/** Driver marks per stop: arrival/departure and headcount. */
export const tripStopEvents = pgTable(
  "trip_stop_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => stops.id, { onDelete: "restrict" }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }).notNull(),
    departedAt: timestamp("departed_at", { withTimezone: true }),
    boarded: integer("boarded").notNull().default(0),
    alighted: integer("alighted").notNull().default(0),
  },
  (t) => [uniqueIndex("trip_stop_events_trip_stop_idx").on(t.tripId, t.stopId)],
);

/** Passenger intent/fact of riding a trip from a stop. */
export const passengerTrips = pgTable(
  "passenger_trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => passengers.userId, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => stops.id, { onDelete: "restrict" }),
    status: passengerTripStatus("status").notNull().default("planned"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("passenger_trips_passenger_trip_idx").on(t.passengerId, t.tripId),
    index("passenger_trips_trip_idx").on(t.tripId),
  ],
);

export const passengerFavorites = pgTable(
  "passenger_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    passengerId: uuid("passenger_id")
      .notNull()
      .references(() => passengers.userId, { onDelete: "cascade" }),
    routeId: uuid("route_id").references(() => routes.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id").references(() => stops.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("passenger_favorites_passenger_idx").on(t.passengerId)],
);

// ---------- Notifications & settings ----------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

// ---------- Stage 2: live positions & push ----------

/** GPS trail of a running trip. Recorded only while the trip is in progress. */
export const vehiclePositions = pgTable(
  "vehicle_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    driverId: uuid("driver_id").references(() => drivers.userId, { onDelete: "set null" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    /** metres from the route polyline at the moment of recording */
    offRouteM: doublePrecision("off_route_m"),
    speedKph: doublePrecision("speed_kph"),
    headingDeg: doublePrecision("heading_deg"),
    accuracyM: doublePrecision("accuracy_m"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("vehicle_positions_trip_idx").on(t.tripId, t.recordedAt)],
);

/** Web push endpoints, one row per browser/device. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint), index("push_subscriptions_user_idx").on(t.userId)],
);

/** One "vehicle is approaching" notice per passenger, trip and stop. */
export const tripStopAlerts = pgTable(
  "trip_stop_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => stops.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("approaching"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("trip_stop_alerts_unique_idx").on(t.tripId, t.stopId, t.userId, t.kind)],
);

/** Key/value app settings (e.g. load thresholds). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Inferred types ----------

export type User = typeof users.$inferSelect;
export type Passenger = typeof passengers.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Stop = typeof stops.$inferSelect;
export type Route = typeof routes.$inferSelect;
export type RouteStop = typeof routeStops.$inferSelect;
export type RouteSchedule = typeof routeSchedules.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type TripStopEvent = typeof tripStopEvents.$inferSelect;
export type PassengerTrip = typeof passengerTrips.$inferSelect;
export type PassengerFavorite = typeof passengerFavorites.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type VehiclePosition = typeof vehiclePositions.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
