ALTER TYPE "public"."connector_type" ADD VALUE 'manual';--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "brand_tag" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "recommended_by" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "recommend_reason" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "onboarded_at" timestamp with time zone;