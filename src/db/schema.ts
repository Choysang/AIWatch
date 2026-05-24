// Slice 0 Drizzle schema (public.*). graphile_worker.* is library-owned.
// Conventions: prefixed-ULID text IDs, timestamptz (UTC), pgEnum for stable sets,
// LLM dimensions as independent smallint columns. event_judgments / event_scores
// are append-only; events holds current_* pointers + denormalized hot fields.

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  interval,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- enums ---
export const platformEnum = pgEnum("platform", [
  "x", "github", "reddit", "hackernews", "blog", "zhihu", "csdn",
  "rss", "news", "youtube", "bilibili", "huggingface", "weibo",
]);
export const sourceTypeEnum = pgEnum("source_type", [
  "official", "employee", "expert", "kol", "media", "community", "open_source_project",
]);
export const sourceLevelEnum = pgEnum("source_level", ["L1", "L2", "L3", "L4", "L5"]);
export const connectorTypeEnum = pgEnum("connector_type", [
  "rss", "github", "hn", "youtube_rss", "huggingface", "reddit", "rsshub", "mock",
]);
export const healthStatusEnum = pgEnum("health_status", ["healthy", "degraded", "paused", "disabled"]);
export const titleSourceEnum = pgEnum("title_source", ["original", "first_sentence", "ai_generated"]);
export const relevanceStatusEnum = pgEnum("relevance_status", ["pending", "relevant", "irrelevant", "dropped"]);
export const selectedLevelEnum = pgEnum("selected_level", ["none", "B", "A", "S"]);
export const eventRelationEnum = pgEnum("event_relation", ["same_event", "related"]);
export const triggerReasonEnum = pgEnum("trigger_reason", [
  "initial", "official_update", "major_correction", "new_evidence", "manual_rejudge",
]);

const ts = (name: string) => timestamp(name, { withTimezone: true });

// --- sources (Source is data; admin-managed) ---
export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    platform: platformEnum("platform").notNull(),
    name: text("name").notNull(),
    handle: text("handle"),
    url: text("url"),
    sourceType: sourceTypeEnum("source_type").notNull(),
    level: sourceLevelEnum("level").notNull(),
    connectorType: connectorTypeEnum("connector_type").notNull(),
    connectorRef: text("connector_ref"), // url / handle / rsshub route
    categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    archivedAt: ts("archived_at"),
    fetchFrequency: interval("fetch_frequency").notNull().default("30 minutes"),
    lastFetchAt: ts("last_fetch_at"),
    nextFetchAt: ts("next_fetch_at"),
    failureCount: integer("failure_count").notNull().default(0),
    healthStatus: healthStatusEnum("health_status").notNull().default("healthy"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("sources_due_idx").on(t.enabled, t.nextFetchAt),
    index("sources_health_idx").on(t.healthStatus),
  ],
);

// --- posts (raw source material) ---
export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => sources.id),
    authorName: text("author_name"),
    authorHandle: text("author_handle"),
    platform: platformEnum("platform").notNull(),
    url: text("url"),
    canonicalUrl: text("canonical_url"),
    contentHash: text("content_hash"),
    rawTitle: text("raw_title"),
    displayTitle: text("display_title"),
    titleSource: titleSourceEnum("title_source"),
    rawContent: text("raw_content"),
    summary: text("summary"),
    media: jsonb("media"),
    publicMetrics: jsonb("public_metrics"),
    publishedAt: ts("published_at"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    initialRelevanceStatus: relevanceStatusEnum("initial_relevance_status").notNull().default("pending"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("posts_source_idx").on(t.sourceId),
    uniqueIndex("posts_source_canonical_uq")
      .on(t.sourceId, t.canonicalUrl)
      .where(sql`canonical_url is not null`),
    index("posts_canonical_idx").on(t.canonicalUrl),
    index("posts_content_hash_idx").on(t.contentHash),
  ],
);

// --- events (the scoring/ranking/promotion object) ---
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    summary: text("summary"),
    recommendationReason: text("recommendation_reason"),
    category: text("category"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    mainSourceId: text("main_source_id").references(() => sources.id),
    mainPostId: text("main_post_id").references(() => posts.id),
    // App-managed pointers into append-only tables (no FK to avoid a cycle).
    currentJudgmentId: text("current_judgment_id"),
    currentScoreId: text("current_score_id"),
    qualityScore: smallint("quality_score"),
    rankScore: real("rank_score"),
    selectedLevel: selectedLevelEnum("selected_level").notNull().default("none"),
    selectedLabel: text("selected_label"),
    publishedAt: ts("published_at"),
    promotedAt: ts("promoted_at"),
    lastStrongSignalAt: ts("last_strong_signal_at"),
    media: jsonb("media"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("events_published_idx").on(t.publishedAt),
    index("events_selected_idx").on(t.selectedLevel, t.promotedAt),
    index("events_rank_idx").on(t.rankScore),
  ],
);

// --- event_posts (same-event / related membership) ---
export const eventPosts = pgTable(
  "event_posts",
  {
    eventId: text("event_id").notNull().references(() => events.id),
    postId: text("post_id").notNull().references(() => posts.id),
    relation: eventRelationEnum("relation").notNull().default("same_event"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.postId] }),
    index("event_posts_post_idx").on(t.postId),
  ],
);

// --- event_judgments (append-only, immutable LLM inputs) ---
export const eventJudgments = pgTable(
  "event_judgments",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    routingConfigVersion: text("routing_config_version").notNull(),
    triggerReason: triggerReasonEnum("trigger_reason").notNull().default("initial"),
    triggerPostId: text("trigger_post_id").references(() => posts.id),
    aiRelevance: smallint("ai_relevance").notNull(),
    impact: smallint("impact").notNull(),
    novelty: smallint("novelty").notNull(),
    audienceUsefulness: smallint("audience_usefulness").notNull(),
    evidenceClarity: smallint("evidence_clarity").notNull(),
    summary: text("summary"),
    category: text("category"),
    tags: text("tags").array(),
    recommendationReason: text("recommendation_reason"),
    raw: jsonb("raw"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("ej_event_idx").on(t.eventId, t.createdAt)],
);

// --- event_scores (append-only, deterministic) ---
export const eventScores = pgTable(
  "event_scores",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    scoringConfigVersion: text("scoring_config_version").notNull(),
    judgmentId: text("judgment_id").notNull().references(() => eventJudgments.id),
    baseScore: real("base_score").notNull(),
    qualityScore: real("quality_score").notNull(),
    promotionScore: real("promotion_score"),
    rankScore: real("rank_score").notNull(),
    displayScore: smallint("display_score").notNull(),
    breakdown: jsonb("breakdown").notNull(),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [index("es_event_idx").on(t.eventId, t.computedAt)],
);

// better-auth tables live in auth-schema.ts; re-export so drizzle-kit emits their
// migrations from this single schema entrypoint (drizzle.config points here).
export { account, session, user, verification } from "./auth-schema";

export const schema = {
  sources,
  posts,
  events,
  eventPosts,
  eventJudgments,
  eventScores,
};
