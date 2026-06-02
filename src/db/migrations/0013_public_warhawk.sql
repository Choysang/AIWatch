ALTER TABLE "event_scores" ADD COLUMN "event_quality_score" real;--> statement-breakpoint
ALTER TABLE "event_scores" ADD COLUMN "confidence_score" real;--> statement-breakpoint
ALTER TABLE "event_scores" ADD COLUMN "selection_score" real;--> statement-breakpoint
ALTER TABLE "event_scores" ADD COLUMN "selection_max_level" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "selection_score" real;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "confidence_score" real;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "selection_max_level" text;--> statement-breakpoint
CREATE INDEX "events_selection_idx" ON "events" USING btree ("selection_score");