-- B1 (v0.5): on-demand readability full-text extraction cache on posts. Populated the
-- first time a reader opens 全文 for the post's event; status = 'ok' | 'empty' | 'error'
-- (null = never attempted). IF NOT EXISTS so a re-run is a no-op.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "full_text" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "full_text_status" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "full_text_fetched_at" timestamp with time zone;
