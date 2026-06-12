ALTER TABLE "sources" ADD COLUMN "poll_tier" text DEFAULT 'normal' NOT NULL;
ALTER TABLE "sources" ADD COLUMN "last_seen_cursor" text;

ALTER TABLE "posts" ADD COLUMN "pipeline_status" text;
ALTER TABLE "posts" ADD COLUMN "light_result_json" jsonb;

ALTER TABLE "events" ADD COLUMN "fold_key" text;
ALTER TABLE "events" ADD COLUMN "simhash" text;
ALTER TABLE "events" ADD COLUMN "pipeline_score" smallint;
ALTER TABLE "events" ADD COLUMN "pipeline_tier" text;
ALTER TABLE "events" ADD COLUMN "one_line_summary" text;
ALTER TABLE "events" ADD COLUMN "detailed_summary" text;
ALTER TABLE "events" ADD COLUMN "core_viewpoints" jsonb;
ALTER TABLE "events" ADD COLUMN "tools" jsonb;
ALTER TABLE "events" ADD COLUMN "people" jsonb;
ALTER TABLE "events" ADD COLUMN "source_count" integer DEFAULT 1 NOT NULL;

UPDATE "events"
SET "source_count" = greatest(1, coalesce(source_counts.source_count, 1))
FROM (
  SELECT ep."event_id", count(distinct p."source_id")::int AS source_count
  FROM "event_posts" ep
  JOIN "posts" p ON p."id" = ep."post_id"
  GROUP BY ep."event_id"
) source_counts
WHERE "events"."id" = source_counts."event_id";

CREATE INDEX "events_fold_idx" ON "events" USING btree ("fold_key", "created_at");
CREATE INDEX "events_pipeline_tier_idx" ON "events" USING btree ("pipeline_tier", "pipeline_score");
