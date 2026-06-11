-- Search performance: denormalized trigram-indexed search blob on events.
-- Replaces the reader search box's ~25-column ILIKE OR (full seq scan) with a single
-- trigram-indexed ILIKE on events.search_text. pg_trgm is in contrib (available on most
-- managed Postgres; CREATE EXTENSION needs the privilege once).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "search_text" text;
--> statement-breakpoint
UPDATE "events" SET "search_text" = concat_ws(' ',
  "title",
  "summary",
  "one_line_summary",
  "detailed_summary",
  "recommendation_reason",
  "category",
  array_to_string("tags", ' ')
) WHERE "search_text" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_search_trgm_idx" ON "events" USING gin ("search_text" gin_trgm_ops);
