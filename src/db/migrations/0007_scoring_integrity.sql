ALTER TABLE "events" ADD COLUMN "peak_score" real;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "expert_direct_push_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "expert_direct_push_by" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "expert_domain" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "expert_weight" real DEFAULT 1 NOT NULL;