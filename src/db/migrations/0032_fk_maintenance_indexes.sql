CREATE INDEX IF NOT EXISTS "event_scores_judgment_idx" ON "event_scores" ("judgment_id");
CREATE INDEX IF NOT EXISTS "event_judgments_trigger_post_idx" ON "event_judgments" ("trigger_post_id") WHERE "trigger_post_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "events_main_post_idx" ON "events" ("main_post_id") WHERE "main_post_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "events_main_source_idx" ON "events" ("main_source_id") WHERE "main_source_id" IS NOT NULL;
