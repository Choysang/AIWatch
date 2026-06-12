CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"contact" text,
	"fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at");