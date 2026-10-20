CREATE TABLE "attendance_reminders" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" "attendance_scan_kind" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_reminders_user_id_date_kind_pk" PRIMARY KEY("user_id","date","kind")
);
--> statement-breakpoint
ALTER TABLE "attendance_reminders" ADD CONSTRAINT "attendance_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;