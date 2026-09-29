CREATE TABLE "passenger_positions" (
	"trip_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy_m" double precision,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "passenger_positions_trip_id_passenger_id_pk" PRIMARY KEY("trip_id","passenger_id")
);
--> statement-breakpoint
ALTER TABLE "passenger_positions" ADD CONSTRAINT "passenger_positions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_positions" ADD CONSTRAINT "passenger_positions_passenger_id_passengers_user_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."passengers"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A deployment set up before the superadmin existed has none, so nobody can add
-- admins. Promote the earliest active admin (never the seed's demo account).
UPDATE "users" SET "is_super" = true
WHERE "id" = (
  SELECT "id" FROM "users"
  WHERE "role" = 'admin' AND "status" = 'active' AND "phone" <> '+992900000001'
  ORDER BY "created_at" LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM "users" WHERE "is_super" AND "status" = 'active' AND "phone" <> '+992900000001'
);
