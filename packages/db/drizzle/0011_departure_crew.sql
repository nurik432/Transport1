ALTER TABLE "route_schedules" ADD COLUMN "driver_id" uuid;--> statement-breakpoint
ALTER TABLE "route_schedules" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "route_schedules" ADD CONSTRAINT "route_schedules_driver_id_drivers_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_schedules" ADD CONSTRAINT "route_schedules_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Existing departures start with the crew of their most recent trip.
UPDATE "route_schedules" rs SET "driver_id" = t."driver_id", "vehicle_id" = t."vehicle_id"
FROM (
  SELECT DISTINCT ON ("schedule_id") "schedule_id", "driver_id", "vehicle_id"
  FROM "trips"
  WHERE "schedule_id" IS NOT NULL AND "status" <> 'cancelled'
  ORDER BY "schedule_id", "date" DESC
) t
WHERE t."schedule_id" = rs."id";
