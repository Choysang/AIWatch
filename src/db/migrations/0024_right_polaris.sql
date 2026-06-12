-- IF NOT EXISTS: 0023_event_down_reaction.sql already added the enum value + column on
-- databases migrated before this file existed; a fresh replay must not double-apply them.
ALTER TYPE "public"."reaction_kind" ADD VALUE IF NOT EXISTS 'down';--> statement-breakpoint
CREATE TABLE "owner_annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"verdict" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "down_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_annotations_subject_uq" ON "owner_annotations" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "owner_annotations_created_idx" ON "owner_annotations" USING btree ("created_at");