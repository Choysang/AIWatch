ALTER TABLE "posts" ADD COLUMN "judge_error" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "judge_failed_at" timestamp with time zone;