CREATE TABLE "passenger_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passengers" ADD COLUMN "pause_from" date;--> statement-breakpoint
ALTER TABLE "passengers" ADD COLUMN "pause_to" date;--> statement-breakpoint
ALTER TABLE "passenger_subscriptions" ADD CONSTRAINT "passenger_subscriptions_passenger_id_passengers_user_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_subscriptions" ADD CONSTRAINT "passenger_subscriptions_schedule_id_route_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."route_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_subscriptions" ADD CONSTRAINT "passenger_subscriptions_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_subscriptions" ADD CONSTRAINT "passenger_subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "passenger_subscriptions_passenger_schedule_idx" ON "passenger_subscriptions" USING btree ("passenger_id","schedule_id");--> statement-breakpoint
CREATE INDEX "passenger_subscriptions_schedule_idx" ON "passenger_subscriptions" USING btree ("schedule_id");