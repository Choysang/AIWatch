CREATE TYPE "public"."content_type" AS ENUM('model_release', 'product_release', 'tech_share', 'discussion');--> statement-breakpoint
ALTER TABLE "event_judgments" ADD COLUMN "content_type" "content_type";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "content_type" "content_type";--> statement-breakpoint
CREATE INDEX "events_content_type_idx" ON "events" USING btree ("content_type");