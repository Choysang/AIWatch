CREATE TYPE "public"."comment_reaction_kind" AS ENUM('like');--> statement-breakpoint
CREATE TABLE "comment_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"kind" "comment_reaction_kind" DEFAULT 'like' NOT NULL,
	"user_id" text,
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_comments" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "event_comments" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_event_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."event_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_reactions_comment_idx" ON "comment_reactions" USING btree ("comment_id","kind");--> statement-breakpoint
CREATE INDEX "comment_reactions_user_idx" ON "comment_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comment_reactions_fingerprint_idx" ON "comment_reactions" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "event_comments_parent_idx" ON "event_comments" USING btree ("parent_id");--> statement-breakpoint
-- Single-level threads: a reply points at a top-level comment. Self-FK keeps parent_id honest.
ALTER TABLE "event_comments" ADD CONSTRAINT "event_comments_parent_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."event_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Identity XOR: exactly one of user_id or fingerprint must be set (mirrors event_reactions).
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_identity_xor"
  CHECK (("user_id" IS NOT NULL) <> ("fingerprint" IS NOT NULL));--> statement-breakpoint
-- Per-identity uniqueness: a user (or fingerprint) can react with a given kind to a comment at most once.
-- Two partial unique indexes because drizzle's uniqueIndex can't express COALESCE(user_id, fingerprint).
CREATE UNIQUE INDEX "comment_reactions_user_uq"
  ON "comment_reactions" ("comment_id", "kind", "user_id") WHERE "user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_reactions_fingerprint_uq"
  ON "comment_reactions" ("comment_id", "kind", "fingerprint") WHERE "fingerprint" IS NOT NULL;