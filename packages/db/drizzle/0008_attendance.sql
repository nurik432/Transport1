CREATE TYPE "public"."attendance_day_status" AS ENUM('worked', 'not_worked', 'vacation', 'sick', 'day_off');--> statement-breakpoint
CREATE TYPE "public"."attendance_geo" AS ENUM('verified', 'unverified', 'out_of_range');--> statement-breakpoint
CREATE TYPE "public"."attendance_point_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."attendance_scan_kind" AS ENUM('morning', 'evening', 'off_window');--> statement-breakpoint
CREATE TYPE "public"."attendance_source" AS ENUM('qr', 'manual');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'attendance_reminder';--> statement-breakpoint
CREATE TABLE "attendance_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"admin_id" uuid,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_day_overrides" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "attendance_day_status" NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_day_overrides_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "attendance_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" integer,
	"token" text NOT NULL,
	"status" "attendance_point_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"point_id" uuid,
	"scanned_at" timestamp with time zone NOT NULL,
	"date" date NOT NULL,
	"kind" "attendance_scan_kind" NOT NULL,
	"geo" "attendance_geo" NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"accuracy_m" double precision,
	"duplicate" boolean DEFAULT false NOT NULL,
	"source" "attendance_source" DEFAULT 'qr' NOT NULL,
	"created_by" uuid,
	"reason" text,
	"trip_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_audit" ADD CONSTRAINT "attendance_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_audit" ADD CONSTRAINT "attendance_audit_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_day_overrides" ADD CONSTRAINT "attendance_day_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_day_overrides" ADD CONSTRAINT "attendance_day_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_scans" ADD CONSTRAINT "attendance_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_scans" ADD CONSTRAINT "attendance_scans_point_id_attendance_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."attendance_points"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_scans" ADD CONSTRAINT "attendance_scans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_scans" ADD CONSTRAINT "attendance_scans_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_scans" ADD CONSTRAINT "attendance_scans_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_audit_user_date_idx" ON "attendance_audit" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_points_token_idx" ON "attendance_points" USING btree ("token");--> statement-breakpoint
CREATE INDEX "attendance_scans_user_date_idx" ON "attendance_scans" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "attendance_scans_date_idx" ON "attendance_scans" USING btree ("date");