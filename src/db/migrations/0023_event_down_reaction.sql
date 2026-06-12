ALTER TYPE "reaction_kind" ADD VALUE IF NOT EXISTS 'down';
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "down_count" integer DEFAULT 0 NOT NULL;
