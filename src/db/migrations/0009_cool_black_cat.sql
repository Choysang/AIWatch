CREATE TABLE "llm_spend_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"month_key" text NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "llm_spend_month_idx" ON "llm_spend_ledger" USING btree ("month_key");