ALTER TABLE "route_stops" ADD COLUMN "road_distance_m" integer;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "path" jsonb;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "path_distance_m" integer;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "path_source" text;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "path_updated_at" timestamp with time zone;