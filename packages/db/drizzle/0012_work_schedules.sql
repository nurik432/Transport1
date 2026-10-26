CREATE TYPE "public"."work_schedule_kind" AS ENUM('weekly', 'cycle');--> statement-breakpoint
CREATE TYPE "public"."work_schedule_status" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'work_schedule_changed';--> statement-breakpoint
CREATE TABLE "driver_work_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"cycle_start" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_schedule_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"admin_id" uuid,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_schedule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"weekdays" integer[],
	"work_days" integer,
	"rest_days" integer,
	"holidays_off" boolean NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "work_schedule_kind" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "work_schedule_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_work_schedules" ADD CONSTRAINT "driver_work_schedules_user_id_drivers_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."drivers"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_work_schedules" ADD CONSTRAINT "driver_work_schedules_schedule_id_work_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_work_schedules" ADD CONSTRAINT "driver_work_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedule_audit" ADD CONSTRAINT "work_schedule_audit_schedule_id_work_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedule_audit" ADD CONSTRAINT "work_schedule_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedule_audit" ADD CONSTRAINT "work_schedule_audit_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedule_versions" ADD CONSTRAINT "work_schedule_versions_schedule_id_work_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedule_versions" ADD CONSTRAINT "work_schedule_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_work_schedules_user_from_idx" ON "driver_work_schedules" USING btree ("user_id","effective_from");--> statement-breakpoint
CREATE INDEX "driver_work_schedules_schedule_idx" ON "driver_work_schedules" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "work_schedule_audit_schedule_idx" ON "work_schedule_audit" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "work_schedule_audit_user_idx" ON "work_schedule_audit" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_schedule_versions_schedule_from_idx" ON "work_schedule_versions" USING btree ("schedule_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "work_schedules_default_idx" ON "work_schedules" USING btree ("is_default") WHERE "work_schedules"."is_default";--> statement-breakpoint
-- The 5/2 every driver was on before schedules existed: default, so nothing changes.
WITH s AS (
	INSERT INTO "work_schedules" ("name", "kind", "is_default") VALUES ('5/2 (пн–пт)', 'weekly', true) RETURNING "id"
)
INSERT INTO "work_schedule_versions" ("schedule_id", "effective_from", "weekdays", "holidays_off")
SELECT "id", '2000-01-01', ARRAY[1,2,3,4,5], true FROM s;
