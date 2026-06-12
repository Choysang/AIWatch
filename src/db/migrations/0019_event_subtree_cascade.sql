-- Add ON DELETE cascade across the full event/source subtree so deleting a source (or an
-- event) removes its dependent rows instead of leaving UI-inaccessible orphans OR blocking
-- the delete outright. The engagement cascades alone are inert: event_judgments/event_scores
-- always exist for a judged event and would otherwise block DELETE event with `no action`.
--
-- Closure (verified exhaustive — no other FK targets these tables):
--   sources         <- posts.source_id, events.main_source_id
--   posts           <- events.main_post_id, event_judgments.trigger_post_id, event_posts.post_id
--   events          <- event_judgments.event_id, event_posts.event_id, event_scores.event_id,
--                       event_reactions.event_id, event_comments.event_id
--   event_judgments <- event_scores.judgment_id
--   event_comments  <- event_comments.parent_id, comment_reactions.comment_id
--
-- Hand-written (drizzle snapshots stop at 0015; 0016-0018 are also hand-written) — do NOT
-- regenerate with drizzle-kit. Auth FKs (account/session -> user) already cascade; untouched.

-- --- references into sources ---
ALTER TABLE "posts" DROP CONSTRAINT "posts_source_id_sources_id_fk";--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_main_source_id_sources_id_fk";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_main_source_id_sources_id_fk" FOREIGN KEY ("main_source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- --- references into posts ---
ALTER TABLE "events" DROP CONSTRAINT "events_main_post_id_posts_id_fk";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_main_post_id_posts_id_fk" FOREIGN KEY ("main_post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_judgments" DROP CONSTRAINT "event_judgments_trigger_post_id_posts_id_fk";--> statement-breakpoint
ALTER TABLE "event_judgments" ADD CONSTRAINT "event_judgments_trigger_post_id_posts_id_fk" FOREIGN KEY ("trigger_post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_posts" DROP CONSTRAINT "event_posts_post_id_posts_id_fk";--> statement-breakpoint
ALTER TABLE "event_posts" ADD CONSTRAINT "event_posts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- --- references into events ---
ALTER TABLE "event_judgments" DROP CONSTRAINT "event_judgments_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "event_judgments" ADD CONSTRAINT "event_judgments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_posts" DROP CONSTRAINT "event_posts_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "event_posts" ADD CONSTRAINT "event_posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_scores" DROP CONSTRAINT "event_scores_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "event_scores" ADD CONSTRAINT "event_scores_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reactions" DROP CONSTRAINT "event_reactions_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "event_reactions" ADD CONSTRAINT "event_reactions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_comments" DROP CONSTRAINT "event_comments_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "event_comments" ADD CONSTRAINT "event_comments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- --- references into event_judgments ---
ALTER TABLE "event_scores" DROP CONSTRAINT "event_scores_judgment_id_event_judgments_id_fk";--> statement-breakpoint
ALTER TABLE "event_scores" ADD CONSTRAINT "event_scores_judgment_id_event_judgments_id_fk" FOREIGN KEY ("judgment_id") REFERENCES "public"."event_judgments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- --- references into event_comments ---
ALTER TABLE "event_comments" DROP CONSTRAINT "event_comments_parent_id_fk";--> statement-breakpoint
ALTER TABLE "event_comments" ADD CONSTRAINT "event_comments_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" DROP CONSTRAINT "comment_reactions_comment_id_event_comments_id_fk";--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_event_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."event_comments"("id") ON DELETE cascade ON UPDATE no action;
