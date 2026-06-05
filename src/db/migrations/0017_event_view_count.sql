ALTER TABLE "events" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;
CREATE INDEX "events_view_count_idx" ON "events" USING btree ("view_count");
