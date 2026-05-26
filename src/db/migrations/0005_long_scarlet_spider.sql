CREATE TYPE "public"."reaction_kind" AS ENUM('like', 'star');--> statement-breakpoint
CREATE TABLE "event_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"user_id" text,
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "star_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_reactions" ADD CONSTRAINT "event_reactions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_reactions_event_kind_idx" ON "event_reactions" USING btree ("event_id","kind");--> statement-breakpoint
CREATE INDEX "event_reactions_user_idx" ON "event_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_reactions_fingerprint_idx" ON "event_reactions" USING btree ("fingerprint");--> statement-breakpoint
-- Exactly one identity column must be set (logged-in user OR anonymous fingerprint, never both, never neither).
ALTER TABLE "event_reactions" ADD CONSTRAINT "event_reactions_identity_chk"
  CHECK ((user_id IS NULL) <> (fingerprint IS NULL));--> statement-breakpoint
-- Per-identity uniqueness: a user (or fingerprint) can react with a given kind to a given event at most once.
CREATE UNIQUE INDEX "event_reactions_user_uq"
  ON "event_reactions" ("event_id", "kind", "user_id")
  WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_reactions_fp_uq"
  ON "event_reactions" ("event_id", "kind", "fingerprint")
  WHERE fingerprint IS NOT NULL;