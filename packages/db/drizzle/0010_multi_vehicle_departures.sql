DROP INDEX "route_schedules_route_time_idx";--> statement-breakpoint
DROP INDEX "trips_route_date_time_idx";--> statement-breakpoint
ALTER TABLE "route_schedules" ADD COLUMN "vehicle_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "vehicle_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "route_schedules_route_time_vehicle_idx" ON "route_schedules" USING btree ("route_id","departure_time","vehicle_no");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_schedule_date_idx" ON "trips" USING btree ("schedule_id","date") WHERE "trips"."schedule_id" is not null;--> statement-breakpoint
CREATE INDEX "trips_route_date_time_idx" ON "trips" USING btree ("route_id","date","start_time");