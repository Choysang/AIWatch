ALTER TYPE "public"."reaction_kind" ADD VALUE 'down';--> statement-breakpoint
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
ALTER TABLE "events" ADD COLUMN "down_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_annotations_subject_uq" ON "owner_annotations" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "owner_annotations_created_idx" ON "owner_annotations" USING btree ("created_at");