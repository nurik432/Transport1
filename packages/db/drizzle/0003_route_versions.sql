-- Route versioning.
--
-- A route's shape (stop order, time offsets, road geometry) moves onto
-- route_versions, and every trip pins the version it ran on. Without this, a
-- change to a route rewrites the past: completed trips would point at the new
-- stop order and the per-stop load history would be wrong.
--
-- The column order below matters: version_id is added nullable, existing rows
-- are migrated onto version 1, and only then does the column become NOT NULL.

CREATE TABLE "route_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"note" text,
	"created_by" uuid,
	"path" jsonb,
	"path_distance_m" integer,
	"path_source" text,
	"path_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_versions" ADD CONSTRAINT "route_versions_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_versions" ADD CONSTRAINT "route_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "route_versions_route_version_idx" ON "route_versions" USING btree ("route_id","version");--> statement-breakpoint

DROP INDEX "route_stops_route_seq_idx";--> statement-breakpoint
DROP INDEX "route_stops_route_stop_idx";--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "version_id" uuid;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "current_version_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "route_version_id" uuid;--> statement-breakpoint

-- Existing data becomes version 1 of each route, carrying its geometry over.
INSERT INTO "route_versions" ("route_id", "version", "note", "path", "path_distance_m", "path_source", "path_updated_at")
SELECT "id", 1, 'Первоначальная версия', "path", "path_distance_m", "path_source", "path_updated_at"
FROM "routes";--> statement-breakpoint

UPDATE "route_stops" rs
SET "version_id" = rv."id"
FROM "route_versions" rv
WHERE rv."route_id" = rs."route_id" AND rv."version" = 1;--> statement-breakpoint

UPDATE "routes" r
SET "current_version_id" = rv."id"
FROM "route_versions" rv
WHERE rv."route_id" = r."id" AND rv."version" = 1;--> statement-breakpoint

UPDATE "trips" t
SET "route_version_id" = rv."id"
FROM "route_versions" rv
WHERE rv."route_id" = t."route_id" AND rv."version" = 1;--> statement-breakpoint

ALTER TABLE "route_stops" ALTER COLUMN "version_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_version_id_route_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."route_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_current_version_id_route_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."route_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_version_id_route_versions_id_fk" FOREIGN KEY ("route_version_id") REFERENCES "public"."route_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "route_stops_version_seq_idx" ON "route_stops" USING btree ("version_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "route_stops_version_stop_idx" ON "route_stops" USING btree ("version_id","stop_id");--> statement-breakpoint
CREATE INDEX "route_stops_route_idx" ON "route_stops" USING btree ("route_id");
