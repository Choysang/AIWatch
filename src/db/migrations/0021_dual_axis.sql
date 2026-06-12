-- Dual-axis taxonomy (2026-06-06 design). Two changes:
--   1. content_type enum 4 -> 5 (non-1:1 remap). Postgres can't RENAME individual enum
--      labels for a many-to-many change, so we rebuild: new enum -> retype columns with a
--      USING map -> drop old enum -> rename. Both events and event_judgments carry the column.
--   2. category (domain axis, plain text) value remap from the old 4 INTELLIGENCE_CATEGORIES
--      to the 6 domains. Deterministic best-effort; scripts/backfill-domain-content-type.ts
--      refines the ambiguous product/biz split and the research/news rows the old data can't
--      express. Old -> new content_type: model_release/product_release -> release,
--      tech_share -> howto, discussion -> opinion.
--
-- NOTE (append-only exception): event_judgments is normally an immutable LLM-input log, but the
-- content_type enum retype is unavoidable (the type is dropped) and the category UPDATE is a
-- deliberate one-off to keep event_judgments.category in lockstep with the events.category remap.
-- This is the only place these append-only columns are rewritten; new rows are never touched.

CREATE TYPE "content_type_new" AS ENUM('release', 'research', 'howto', 'opinion', 'news');
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "content_type" TYPE "content_type_new" USING (
  CASE "content_type"::text
    WHEN 'model_release' THEN 'release'
    WHEN 'product_release' THEN 'release'
    WHEN 'tech_share' THEN 'howto'
    WHEN 'discussion' THEN 'opinion'
    ELSE NULL
  END::"content_type_new"
);
--> statement-breakpoint
ALTER TABLE "event_judgments" ALTER COLUMN "content_type" TYPE "content_type_new" USING (
  CASE "content_type"::text
    WHEN 'model_release' THEN 'release'
    WHEN 'product_release' THEN 'release'
    WHEN 'tech_share' THEN 'howto'
    WHEN 'discussion' THEN 'opinion'
    ELSE NULL
  END::"content_type_new"
);
--> statement-breakpoint
DROP TYPE "content_type";
--> statement-breakpoint
ALTER TYPE "content_type_new" RENAME TO "content_type";
--> statement-breakpoint
UPDATE "events" SET "category" = CASE "category"
  WHEN 'Core_Research' THEN 'research_paper'
  WHEN 'Dev_Stack' THEN 'framework_tools'
  WHEN 'Product_Business' THEN 'product_app'
  WHEN 'Practical_Build' THEN 'framework_tools'
  ELSE "category"
END
WHERE "category" IN ('Core_Research', 'Dev_Stack', 'Product_Business', 'Practical_Build');
--> statement-breakpoint
UPDATE "event_judgments" SET "category" = CASE "category"
  WHEN 'Core_Research' THEN 'research_paper'
  WHEN 'Dev_Stack' THEN 'framework_tools'
  WHEN 'Product_Business' THEN 'product_app'
  WHEN 'Practical_Build' THEN 'framework_tools'
  ELSE "category"
END
WHERE "category" IN ('Core_Research', 'Dev_Stack', 'Product_Business', 'Practical_Build');
--> statement-breakpoint
-- buildEventSearchText() embeds the domain id in events.search_text, so the category remap above
-- leaves the old id stranded in the search blob of pre-existing rows. Replace the legacy tokens in
-- place (distinctive Capitalized_Underscore ids — no false positives against titles/summaries).
UPDATE "events" SET "search_text" = replace(replace(replace(replace(
  "search_text",
  'Core_Research', 'research_paper'),
  'Dev_Stack', 'framework_tools'),
  'Product_Business', 'product_app'),
  'Practical_Build', 'framework_tools')
WHERE "search_text" LIKE '%Core_Research%'
   OR "search_text" LIKE '%Dev_Stack%'
   OR "search_text" LIKE '%Product_Business%'
   OR "search_text" LIKE '%Practical_Build%';
