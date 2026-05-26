// Slice 0 Drizzle schema (public.*). graphile_worker.* is library-owned.
// Conventions: prefixed-ULID text IDs, timestamptz (UTC), pgEnum for stable sets,
// LLM dimensions as independent smallint columns. event_judgments / event_scores
// are append-only; events holds current_* pointers + denormalized hot fields.

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
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
export const reportKindEnum = pgEnum("report_kind", ["daily", "weekly", "monthly"]);
export const reportStatusEnum = pgEnum("report_status", ["draft", "published"]);
export const contributionTargetEnum = pgEnum("contribution_target", [
  "source", "event", "post", "report", "config", "documentation",
]);
export const contributionKindEnum = pgEnum("contribution_kind", [
  "source_recommendation", "source_metadata_fix", "tag_category_suggestion",
  "merge_association_suggestion", "correction_report", "documentation",
]);
export const contributionStatusEnum = pgEnum("contribution_status", [
  "submitted", "triaged", "approved", "rejected", "applied",
]);
export const reactionKindEnum = pgEnum("reaction_kind", ["like", "star"]);

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
    // Pause-suggestion flag (decision 9): the suggest-source-review job sets these when a
    // source stops contributing; nothing pauses automatically — an admin confirms. Cleared
    // (back to null) by the same job once the source recovers.
    reviewSuggestedAt: ts("review_suggested_at"),
    reviewReason: text("review_reason"),
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
    // Denormalized reaction counts. Source of truth = event_reactions; these are
    // maintained transactionally by addReaction/removeReaction (Slice 7).
    likeCount: integer("like_count").notNull().default(0),
    starCount: integer("star_count").notNull().default(0),
    selectedLevel: selectedLevelEnum("selected_level").notNull().default("none"),
    selectedLabel: text("selected_label"),
    // Explainable promotion snapshot, written ONLY by the promotion job (decision: selected
    // level/why is deterministic + auditable). Holds version, score, threshold, window, rank.
    selectedBreakdown: jsonb("selected_breakdown"),
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

// --- reports (daily/weekly/monthly; assembled deterministically from events) ---
// Calendar-keyed in APP_TZ (decision E): unique per (kind, report_date). `content` holds
// the assembled ReportContent jsonb (sections); regenerating a date upserts in place.
// Daily auto-publishes; weekly/monthly land as `draft` for review (spec).
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    kind: reportKindEnum("kind").notNull(),
    reportDate: date("report_date", { mode: "string" }).notNull(),
    appTz: text("app_tz").notNull(),
    status: reportStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull(),
    summary: text("summary"),
    content: jsonb("content").notNull(),
    reportConfigVersion: text("report_config_version").notNull(),
    scoringConfigVersion: text("scoring_config_version").notNull(),
    generatedAt: ts("generated_at").notNull().defaultNow(),
    publishedAt: ts("published_at"),
  },
  (t) => [
    uniqueIndex("reports_kind_date_uq").on(t.kind, t.reportDate),
    index("reports_kind_status_date_idx").on(t.kind, t.status, t.reportDate),
  ],
);

// --- contributions (decision 14: public submit -> review -> apply; DB is live truth) ---
// Public users submit suggestions; nothing goes live automatically (spec). On `applied`,
// the review job writes the DB target plus an audit_logs row. Contributor is either an
// account (contributor_user_id) or an anonymous fingerprint — never trusted as identity.
export const contributions = pgTable(
  "contributions",
  {
    id: text("id").primaryKey(),
    kind: contributionKindEnum("kind").notNull(),
    targetType: contributionTargetEnum("target_type").notNull(),
    targetId: text("target_id"), // existing object the change concerns, if any
    proposedChange: jsonb("proposed_change").notNull(),
    reason: text("reason"),
    contributorUserId: text("contributor_user_id"),
    contributorFingerprint: text("contributor_fingerprint"),
    contributorContact: text("contributor_contact"),
    status: contributionStatusEnum("status").notNull().default("submitted"),
    reviewerId: text("reviewer_id"),
    reviewNote: text("review_note"),
    appliedTargetId: text("applied_target_id"), // object created/updated on apply
    createdAt: ts("created_at").notNull().defaultNow(),
    reviewedAt: ts("reviewed_at"),
  },
  (t) => [
    index("contrib_status_idx").on(t.status, t.createdAt),
    index("contrib_target_idx").on(t.targetType, t.targetId),
  ],
);

// --- event_reactions (user feedback: likes + stars; Slice 7) ---
// Identity = either userId (logged-in) OR contributorFingerprint (anonymous, salted
// truncated sha256 of IP+UA — never trusted as identity, only as a soft dedupe key).
// Uniqueness is enforced by a partial unique index per-identity-kind (see migration);
// drizzle's uniqueIndex builder doesn't model COALESCE so we keep the table-level
// constraint with a regular index here and define the partial unique indexes in SQL.
export const eventReactions = pgTable(
  "event_reactions",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    kind: reactionKindEnum("kind").notNull(),
    userId: text("user_id"),
    fingerprint: text("fingerprint"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("event_reactions_event_kind_idx").on(t.eventId, t.kind),
    index("event_reactions_user_idx").on(t.userId),
    index("event_reactions_fingerprint_idx").on(t.fingerprint),
  ],
);

// --- audit_logs (append-only; spec: Audit Requirements) ---
// before/after capture the change; secret values are never stored (decision: secret-
// related config checks log the check, not the secret).
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    actorId: text("actor_id"), // null = system/automated
    targetType: text("target_type"),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_target_idx").on(t.targetType, t.targetId),
  ],
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
  reports,
  contributions,
  eventReactions,
  auditLogs,
};
