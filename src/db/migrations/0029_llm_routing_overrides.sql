-- C1 (v0.5): owner-editable model routing. One row per LLM task overrides the static
-- provider/model in src/llm/routing.ts. The worker caches these (refreshed by cron) so
-- resolveProvider stays synchronous on the judge hot path.
CREATE TABLE "llm_routing_overrides" (
	"task" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
