ALTER TABLE "sessions" ADD COLUMN "remember" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "pin_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "unlocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_super" boolean DEFAULT false NOT NULL;