CREATE TYPE "public"."comment_category" AS ENUM('praise', 'criticism', 'handson', 'supplement', 'controversy', 'low_value', 'unclassified');--> statement-breakpoint
CREATE TYPE "public"."comment_classification" AS ENUM('valid', 'low_value');--> statement-breakpoint
CREATE TABLE "event_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text,
	"fingerprint" text,
	"body" text NOT NULL,
	"body_hash" text NOT NULL,
	"category" "comment_category" DEFAULT 'unclassified' NOT NULL,
	"classification" "comment_classification" DEFAULT 'valid' NOT NULL,
	"is_expert" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_comments" ADD CONSTRAINT "event_comments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_comments_event_idx" ON "event_comments" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "event_comments_user_idx" ON "event_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_comments_fingerprint_idx" ON "event_comments" USING btree ("fingerprint");--> statement-breakpoint
-- Identity XOR: exactly one of user_id or fingerprint must be set (mirrors event_reactions).
ALTER TABLE "event_comments" ADD CONSTRAINT "event_comments_identity_xor"
  CHECK ((user_id IS NULL) <> (fingerprint IS NULL));--> statement-breakpoint
-- Per-identity dedupe of identical bodies (same identity + same bodyHash + same event = no-op).
-- Two partial unique indexes because drizzle's uniqueIndex can't express COALESCE(user_id, fingerprint).
CREATE UNIQUE INDEX "event_comments_user_dedupe_uidx"
  ON "event_comments" ("event_id", "user_id", "body_hash") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_comments_fingerprint_dedupe_uidx"
  ON "event_comments" ("event_id", "fingerprint", "body_hash") WHERE "fingerprint" IS NOT NULL;