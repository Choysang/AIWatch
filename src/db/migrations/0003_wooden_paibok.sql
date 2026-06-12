CREATE TYPE "public"."contribution_kind" AS ENUM('source_recommendation', 'source_metadata_fix', 'tag_category_suggestion', 'merge_association_suggestion', 'correction_report', 'documentation');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('submitted', 'triaged', 'approved', 'rejected', 'applied');--> statement-breakpoint
CREATE TYPE "public"."contribution_target" AS ENUM('source', 'event', 'post', 'report', 'config', 'documentation');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "contribution_kind" NOT NULL,
	"target_type" "contribution_target" NOT NULL,
	"target_id" text,
	"proposed_change" jsonb NOT NULL,
	"reason" text,
	"contributor_user_id" text,
	"contributor_fingerprint" text,
	"contributor_contact" text,
	"status" "contribution_status" DEFAULT 'submitted' NOT NULL,
	"reviewer_id" text,
	"review_note" text,
	"applied_target_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "contrib_status_idx" ON "contributions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contrib_target_idx" ON "contributions" USING btree ("target_type","target_id");