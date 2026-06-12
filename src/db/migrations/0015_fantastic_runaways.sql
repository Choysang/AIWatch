CREATE TYPE "public"."notification_kind" AS ENUM('comment_reply', 'comment_like', 'source_approved');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"actor_id" text,
	"title" text NOT NULL,
	"body" text,
	"target_type" text,
	"target_id" text,
	"event_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
-- Unread-count fast path: the bell badge reads COUNT(*) WHERE user_id = ? AND read_at IS NULL.
CREATE INDEX "notifications_unread_idx" ON "notifications" ("user_id") WHERE "read_at" IS NULL;--> statement-breakpoint
-- comment_like dedup: at most one like-notification per (recipient, comment, actor) so repeated
-- like/unlike by the same actor never spams. drizzle's uniqueIndex can't express the WHERE clause
-- (same reason as comment_reactions), so it's hand-written here. comment_reply/source_approved are
-- intentionally NOT deduped (each reply / approval is a distinct event).
CREATE UNIQUE INDEX "notifications_comment_like_uq"
  ON "notifications" ("user_id", "target_id", "actor_id") WHERE "kind" = 'comment_like';