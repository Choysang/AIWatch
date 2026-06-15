-- A (v0.5): topic boards can scope by source, not only tags. A board becomes an "interest":
-- events carrying ANY of these tags OR from ANY of these sources. Existing boards default to
-- no source filter (empty array), so behavior is unchanged until a reader adds sources.
ALTER TABLE "topic_boards" ADD COLUMN IF NOT EXISTS "source_ids" text[] DEFAULT '{}'::text[] NOT NULL;
