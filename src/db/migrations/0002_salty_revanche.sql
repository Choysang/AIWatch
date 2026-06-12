CREATE TYPE "public"."report_kind" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "report_kind" NOT NULL,
	"report_date" date NOT NULL,
	"app_tz" text NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" jsonb NOT NULL,
	"report_config_version" text NOT NULL,
	"scoring_config_version" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reports_kind_date_uq" ON "reports" USING btree ("kind","report_date");--> statement-breakpoint
CREATE INDEX "reports_kind_status_date_idx" ON "reports" USING btree ("kind","status","report_date");