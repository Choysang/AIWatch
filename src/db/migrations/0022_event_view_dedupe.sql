CREATE TABLE "event_views" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text,
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_views" ADD CONSTRAINT "event_views_event_id_events_id_fk"
  FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_views" ADD CONSTRAINT "event_views_identity_xor"
  CHECK (("user_id" IS NOT NULL) <> ("fingerprint" IS NOT NULL));--> statement-breakpoint
CREATE INDEX "event_views_event_idx" ON "event_views" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_views_user_idx" ON "event_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_views_fingerprint_idx" ON "event_views" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "event_views_user_uq"
  ON "event_views" ("event_id", "user_id") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_views_fingerprint_uq"
  ON "event_views" ("event_id", "fingerprint") WHERE "fingerprint" IS NOT NULL;
