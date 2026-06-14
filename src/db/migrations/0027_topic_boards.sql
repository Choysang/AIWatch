CREATE TABLE "topic_boards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"fingerprint" text,
	"name" text NOT NULL,
	"emoji" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_boards_identity_xor" CHECK (num_nonnulls("user_id", "fingerprint") = 1)
);
--> statement-breakpoint
ALTER TABLE "topic_boards" ADD CONSTRAINT "topic_boards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_boards_user_idx" ON "topic_boards" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "topic_boards_fingerprint_idx" ON "topic_boards" USING btree ("fingerprint","sort_order");--> statement-breakpoint
-- Per-identity unique board name (case-insensitive). Partial-by-identity-kind: drizzle can't
-- model the WHERE clause, so these live SQL-only (same pattern as event_reactions dedupe).
CREATE UNIQUE INDEX "topic_boards_user_name_uq" ON "topic_boards" USING btree ("user_id", lower("name")) WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_boards_fingerprint_name_uq" ON "topic_boards" USING btree ("fingerprint", lower("name")) WHERE "fingerprint" IS NOT NULL;--> statement-breakpoint
-- text[] GIN (array_ops) for topic_boards' `events.tags && board.tags` overlap (v0.5 A1).
CREATE INDEX "events_tags_gin_idx" ON "events" USING gin ("tags");