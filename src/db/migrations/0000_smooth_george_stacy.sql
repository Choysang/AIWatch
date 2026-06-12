CREATE TYPE "public"."connector_type" AS ENUM('rss', 'github', 'hn', 'youtube_rss', 'huggingface', 'reddit', 'rsshub', 'mock');--> statement-breakpoint
CREATE TYPE "public"."event_relation" AS ENUM('same_event', 'related');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('healthy', 'degraded', 'paused', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('x', 'github', 'reddit', 'hackernews', 'blog', 'zhihu', 'csdn', 'rss', 'news', 'youtube', 'bilibili', 'huggingface', 'weibo');--> statement-breakpoint
CREATE TYPE "public"."relevance_status" AS ENUM('pending', 'relevant', 'irrelevant', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."selected_level" AS ENUM('none', 'B', 'A', 'S');--> statement-breakpoint
CREATE TYPE "public"."source_level" AS ENUM('L1', 'L2', 'L3', 'L4', 'L5');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('official', 'employee', 'expert', 'kol', 'media', 'community', 'open_source_project');--> statement-breakpoint
CREATE TYPE "public"."title_source" AS ENUM('original', 'first_sentence', 'ai_generated');--> statement-breakpoint
CREATE TYPE "public"."trigger_reason" AS ENUM('initial', 'official_update', 'major_correction', 'new_evidence', 'manual_rejudge');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_judgments" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"routing_config_version" text NOT NULL,
	"trigger_reason" "trigger_reason" DEFAULT 'initial' NOT NULL,
	"trigger_post_id" text,
	"ai_relevance" smallint NOT NULL,
	"impact" smallint NOT NULL,
	"novelty" smallint NOT NULL,
	"audience_usefulness" smallint NOT NULL,
	"evidence_clarity" smallint NOT NULL,
	"summary" text,
	"category" text,
	"tags" text[],
	"recommendation_reason" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_posts" (
	"event_id" text NOT NULL,
	"post_id" text NOT NULL,
	"relation" "event_relation" DEFAULT 'same_event' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_posts_event_id_post_id_pk" PRIMARY KEY("event_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "event_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"scoring_config_version" text NOT NULL,
	"judgment_id" text NOT NULL,
	"base_score" real NOT NULL,
	"quality_score" real NOT NULL,
	"promotion_score" real,
	"rank_score" real NOT NULL,
	"display_score" smallint NOT NULL,
	"breakdown" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"recommendation_reason" text,
	"category" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"main_source_id" text,
	"main_post_id" text,
	"current_judgment_id" text,
	"current_score_id" text,
	"quality_score" smallint,
	"rank_score" real,
	"selected_level" "selected_level" DEFAULT 'none' NOT NULL,
	"selected_label" text,
	"published_at" timestamp with time zone,
	"promoted_at" timestamp with time zone,
	"last_strong_signal_at" timestamp with time zone,
	"media" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"author_name" text,
	"author_handle" text,
	"platform" "platform" NOT NULL,
	"url" text,
	"canonical_url" text,
	"content_hash" text,
	"raw_title" text,
	"display_title" text,
	"title_source" "title_source",
	"raw_content" text,
	"summary" text,
	"media" jsonb,
	"public_metrics" jsonb,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"initial_relevance_status" "relevance_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"name" text NOT NULL,
	"handle" text,
	"url" text,
	"source_type" "source_type" NOT NULL,
	"level" "source_level" NOT NULL,
	"connector_type" "connector_type" NOT NULL,
	"connector_ref" text,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"fetch_frequency" interval DEFAULT '30 minutes' NOT NULL,
	"last_fetch_at" timestamp with time zone,
	"next_fetch_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"health_status" "health_status" DEFAULT 'healthy' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_judgments" ADD CONSTRAINT "event_judgments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_judgments" ADD CONSTRAINT "event_judgments_trigger_post_id_posts_id_fk" FOREIGN KEY ("trigger_post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_posts" ADD CONSTRAINT "event_posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_posts" ADD CONSTRAINT "event_posts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_scores" ADD CONSTRAINT "event_scores_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_scores" ADD CONSTRAINT "event_scores_judgment_id_event_judgments_id_fk" FOREIGN KEY ("judgment_id") REFERENCES "public"."event_judgments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_main_source_id_sources_id_fk" FOREIGN KEY ("main_source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_main_post_id_posts_id_fk" FOREIGN KEY ("main_post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ej_event_idx" ON "event_judgments" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "event_posts_post_idx" ON "event_posts" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "es_event_idx" ON "event_scores" USING btree ("event_id","computed_at");--> statement-breakpoint
CREATE INDEX "events_published_idx" ON "events" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "events_selected_idx" ON "events" USING btree ("selected_level","promoted_at");--> statement-breakpoint
CREATE INDEX "events_rank_idx" ON "events" USING btree ("rank_score");--> statement-breakpoint
CREATE INDEX "posts_source_idx" ON "posts" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_source_canonical_uq" ON "posts" USING btree ("source_id","canonical_url") WHERE canonical_url is not null;--> statement-breakpoint
CREATE INDEX "posts_canonical_idx" ON "posts" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "posts_content_hash_idx" ON "posts" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "sources_due_idx" ON "sources" USING btree ("enabled","next_fetch_at");--> statement-breakpoint
CREATE INDEX "sources_health_idx" ON "sources" USING btree ("health_status");