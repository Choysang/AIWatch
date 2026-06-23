// Slice 0 Drizzle schema (public.*). graphile_worker.* is library-owned.
// Conventions: prefixed-ULID text IDs, timestamptz (UTC), pgEnum for stable sets,
// LLM dimensions as independent smallint columns. event_judgments / event_scores
// are append-only; events holds current_* pointers + denormalized hot fields.

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
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
import { user as authUser } from "./auth-schema";
import type { RichBlock } from "@/content/rich-blocks";

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
  "rss", "github", "hn", "youtube_rss", "huggingface", "reddit", "rsshub", "mock", "manual",
]);
export const healthStatusEnum = pgEnum("health_status", ["healthy", "degraded", "paused", "disabled"]);
export const titleSourceEnum = pgEnum("title_source", ["original", "first_sentence", "ai_generated"]);
export const relevanceStatusEnum = pgEnum("relevance_status", ["pending", "relevant", "irrelevant", "dropped"]);
export const selectedLevelEnum = pgEnum("selected_level", ["none", "B", "A", "S"]);
// Reader-facing content-type axis (dual-axis taxonomy, 2026-06-06 design §2.2): every event
// is one of these five forms. Produced directly by the triage LLM (immutable input) and
// denormalized onto events for filtering + the selection-score multiplier. Nullable only for
// legacy rows awaiting backfill — new events always carry a value (the judge schema requires
// it, no fallback). Migration 0021 rebuilds this enum from the old 4 values (non-1:1 remap).
export const contentTypeEnum = pgEnum("content_type", [
  "release", "research", "howto", "opinion", "news",
]);
// Comment reactions (SP3 point 7): readers can like a comment. Only "like" for V1
// (KISS — no star/downvote); the enum leaves room to extend without a column rename.
export const commentReactionKindEnum = pgEnum("comment_reaction_kind", ["like"]);
// SP3.3 point 7: reader notifications. comment_reply/comment_like are reader-driven;
// source_approved reuses the existing contribution-apply path (notify the recommender).
export const notificationKindEnum = pgEnum("notification_kind", [
  "comment_reply",
  "comment_like",
  "source_approved",
  // Hourly owner/admin digest of newly submitted contributions (信源推荐收集, 2026-06-13).
  "contribution_digest",
]);
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
export const reactionKindEnum = pgEnum("reaction_kind", ["like", "star", "down"]);
export const commentCategoryEnum = pgEnum("comment_category", [
  "praise", "criticism", "handson", "supplement", "controversy",
  "low_value", "unclassified",
]);
export const commentClassificationEnum = pgEnum("comment_classification", [
  "valid", "low_value",
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
    // Curated provenance ("田区"/source-info card, Task 3). Human-authored, admin-managed:
    // these are why a manually-onboarded source (e.g. an X account) is on the watch list.
    // All nullable — legacy/auto sources carry none. Shown on the reader card's source block.
    brandTag: text("brand_tag"), // 信源标签 (e.g. "OpenAI")
    recommendedBy: text("recommended_by"), // 推荐人名称
    recommendReason: text("recommend_reason"), // 推荐理由 (source-level, not event-level)
    onboardedAt: ts("onboarded_at"), // 接入日期
    enabled: boolean("enabled").notNull().default(true),
    pollTier: text("poll_tier").notNull().default("normal"),
    lastSeenCursor: text("last_seen_cursor"),
    archivedAt: ts("archived_at"),
    fetchFrequency: interval("fetch_frequency").notNull().default("10 minutes"),
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
    sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
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
    pipelineStatus: text("pipeline_status"),
    lightResultJson: jsonb("light_result_json"),
    // Spec § 11 LLM: "malformed marks the post `judge_failed`, never silently defaulted".
    // Non-null = the cold_judge step failed for this post and no event was created. The
    // value is a short machine-readable reason (provider_error / schema_invalid / no_key).
    // A later slice can retry by clearing this field; for now it just blocks event creation
    // and is reported on the admin dashboard.
    judgeError: text("judge_error"),
    judgeFailedAt: ts("judge_failed_at"),
    // B1 (v0.5): on-demand readability full-text extraction cache. full_text_status is
    // 'ok' | 'empty' | 'error' (null = never attempted). Filled when a reader first opens
    // 全文 for this post's event; see src/content/extract.ts + article-fulltext.ts.
    fullText: text("full_text"),
    fullTextStatus: text("full_text_status"),
    fullTextFetchedAt: ts("full_text_fetched_at"),
    // B1.5 (v0.5): structured rich-content blocks (tables/code/images/headings) parsed from the
    // readability HTML, cached alongside full_text. Rendered via React elements (XSS-inert);
    // null/[] = no rich content (client falls back to plain full_text / 原文). See rich-blocks.ts.
    fullBlocks: jsonb("full_blocks").$type<RichBlock[]>(),
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
    foldKey: text("fold_key"),
    simhash: text("simhash"),
    pipelineScore: smallint("pipeline_score"),
    pipelineTier: text("pipeline_tier"),
    oneLineSummary: text("one_line_summary"),
    detailedSummary: text("detailed_summary"),
    coreViewpoints: jsonb("core_viewpoints"),
    tools: jsonb("tools"),
    people: jsonb("people"),
    sourceCount: integer("source_count").notNull().default(1),
    title: text("title").notNull(),
    summary: text("summary"),
    recommendationReason: text("recommendation_reason"),
    // Reader-facing article category. Holds an INTELLIGENCE_DOMAINS id
    // (product/technology/tips/discussion). Kept as text so value churn is a data migration,
    // not a type rebuild.
    category: text("category"),
    // Denormalized free-text search blob (title + summaries + reco + tags + category, lower-cased
    // at write time). Backs the reader search box via a single trigram-indexed ILIKE instead of an
    // OR across ~25 columns (which no index can serve). Maintained by createEventFromPost /
    // foldPostIntoEvent; backfilled in migration 0020. Source/author names usually surface in the
    // event text already, so we intentionally do not thread them through the write path.
    searchText: text("search_text"),
    // Reader-facing content classification (SP2). Denormalized from the current judgment;
    // nullable only for legacy rows pending backfill. Indexed for the filter facet.
    contentType: contentTypeEnum("content_type"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    mainSourceId: text("main_source_id").references(() => sources.id, { onDelete: "cascade" }),
    mainPostId: text("main_post_id").references(() => posts.id, { onDelete: "cascade" }),
    // App-managed pointers into append-only tables (no FK to avoid a cycle).
    currentJudgmentId: text("current_judgment_id"),
    currentScoreId: text("current_score_id"),
    qualityScore: smallint("quality_score"),
    rankScore: real("rank_score"),
    // Highest promotion_score ever observed for this event. Display_score decays toward
    // grade_floor[level] from peak_score (spec § Display score formula). Initialized at first
    // promotion and only ratchets upward — strong signals re-arming the peak is the explicit
    // anti-decay lever. Null = never promoted, so decay logic short-circuits to qualityScore.
    peakScore: real("peak_score"),
    // scoring-v2 (SP4) denormalized hot fields. selection_score drives the v2 promotion
    // tournament + ordering; confidence_score + selection_max_level power explainable display
    // and the low-confidence tier cap (confidence < 40 => max tier B). Nullable until
    // recompute-scores-v2 backfills; legacy rows fall back to v1 base/promotion in the job.
    selectionScore: real("selection_score"),
    confidenceScore: real("confidence_score"),
    selectionMaxLevel: text("selection_max_level"),
    // Expert direct-push to B-tier (spec § B / daily selected — "score >= 75, or certified
    // expert direct-push"). Stamped by the admin/expert console; the promotion job treats this
    // flag as an automatic B qualifier regardless of base_score. expertDirectPushBy points at
    // user.id for audit (paired with an audit_logs row written transactionally with the flag).
    expertDirectPushAt: ts("expert_direct_push_at"),
    expertDirectPushBy: text("expert_direct_push_by"),
    // Denormalized reaction counts. Source of truth = event_reactions; these are
    // maintained transactionally by addReaction/removeReaction (Slice 7).
    likeCount: integer("like_count").notNull().default(0),
    starCount: integer("star_count").notNull().default(0),
    downCount: integer("down_count").notNull().default(0),
    // Deduped reader attention signal. Incremented once per event+viewer identity when a
    // reader opens the detail page or original source link from a card.
    viewCount: integer("view_count").notNull().default(0),
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
    index("events_content_type_idx").on(t.contentType),
    index("events_selection_idx").on(t.selectionScore),
    index("events_fold_idx").on(t.foldKey, t.createdAt),
    index("events_pipeline_tier_idx").on(t.pipelineTier, t.pipelineScore),
    // Trigram GIN over the denormalized search blob: lets leading-wildcard ILIKE (incl. CJK
    // substrings) use an index. Requires the pg_trgm extension (created in migration 0020).
    index("events_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
    // text[] GIN (array_ops): serves topic_boards' `tags && board.tags` overlap (v0.5 A1) and
    // any future tag facet. Without it the overlap predicate sequential-scans. Created
    // alongside topic_boards in migration 0027.
    index("events_tags_gin_idx").using("gin", t.tags),
  ],
);

// --- event_posts (same-event / related membership) ---
export const eventPosts = pgTable(
  "event_posts",
  {
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
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
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    routingConfigVersion: text("routing_config_version").notNull(),
    triggerReason: triggerReasonEnum("trigger_reason").notNull().default("initial"),
    triggerPostId: text("trigger_post_id").references(() => posts.id, { onDelete: "cascade" }),
    aiRelevance: smallint("ai_relevance").notNull(),
    impact: smallint("impact").notNull(),
    novelty: smallint("novelty").notNull(),
    audienceUsefulness: smallint("audience_usefulness").notNull(),
    evidenceClarity: smallint("evidence_clarity").notNull(),
    summary: text("summary"),
    category: text("category"),
    contentType: contentTypeEnum("content_type"),
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
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    scoringConfigVersion: text("scoring_config_version").notNull(),
    judgmentId: text("judgment_id").notNull().references(() => eventJudgments.id, { onDelete: "cascade" }),
    baseScore: real("base_score").notNull(),
    qualityScore: real("quality_score").notNull(),
    promotionScore: real("promotion_score"),
    // scoring-v2 layers (SP4). Nullable: written only by the v2 creation/recompute path; v1
    // rows leave them null. The row's scoring_config_version still stamps the v1 base_score;
    // v2 provenance (scoringV2Config.version) lives in `breakdown`.
    eventQualityScore: real("event_quality_score"),
    confidenceScore: real("confidence_score"),
    selectionScore: real("selection_score"),
    selectionMaxLevel: text("selection_max_level"),
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
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
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

// --- event_views (deduped reader attention) ---
// One row per event+viewer identity. events.view_count is incremented only when a new
// row is inserted, so public POSTs cannot inflate the counter by replaying the same view.
export const eventViews = pgTable(
  "event_views",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    fingerprint: text("fingerprint"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("event_views_event_idx").on(t.eventId),
    index("event_views_user_idx").on(t.userId),
    index("event_views_fingerprint_idx").on(t.fingerprint),
  ],
);

// --- event_comments (Slice 9: comments and follow-up) ---
// Comments are centered on the event, not the post (spec). Identity follows the same
// XOR shape as event_reactions: userId XOR fingerprint, enforced by CHECK + partial
// unique indexes in the migration (drizzle can't model COALESCE-based uniqueness).
// classification is deterministic (src/comments/classifier.ts), not LLM — the spec
// lists explicit low-value rules. isExpert is snapshotted from user.role == "expert"
// at insert time so the "expert views" section can filter without joining user.
// bodyHash dedupes identical re-submissions (same identity + same text = no-op).
export const eventComments = pgTable(
  "event_comments",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    fingerprint: text("fingerprint"),
    body: text("body").notNull(),
    bodyHash: text("body_hash").notNull(),
    category: commentCategoryEnum("category").notNull().default("unclassified"),
    classification: commentClassificationEnum("classification").notNull().default("valid"),
    isExpert: boolean("is_expert").notNull().default(false),
    // SP3 point 7: single-level threads. Top-level comments have parent_id = null; a reply
    // points at its top-level parent. Replies of replies are flattened onto the same parent
    // (the UI conveys who-replied-to-whom with @mention), so the tree is never deeper than one.
    // The self-FK (event_comments_parent_id_fk) is defined SQL-only with ON DELETE cascade
    // (migrations 0014 + 0019); drizzle's .references() can't cleanly model the self-reference,
    // so unlike the other three event/comment FKs the cascade for this one lives only in SQL.
    parentId: text("parent_id"),
    // Denormalized like tally, maintained transactionally by comment_reactions add/remove.
    likeCount: integer("like_count").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("event_comments_event_idx").on(t.eventId, t.createdAt),
    index("event_comments_user_idx").on(t.userId),
    index("event_comments_fingerprint_idx").on(t.fingerprint),
    index("event_comments_parent_idx").on(t.parentId),
  ],
);

// --- comment_reactions (SP3 point 7: like a comment) ---
// Same XOR identity + partial-unique-dedupe shape as event_reactions, keyed on the comment
// instead of the event. event_comments.like_count is the denormalized tally kept in sync
// transactionally. "like" is the only kind in V1.
export const commentReactions = pgTable(
  "comment_reactions",
  {
    id: text("id").primaryKey(),
    commentId: text("comment_id").notNull().references(() => eventComments.id, { onDelete: "cascade" }),
    kind: commentReactionKindEnum("kind").notNull().default("like"),
    userId: text("user_id"),
    fingerprint: text("fingerprint"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("comment_reactions_comment_idx").on(t.commentId, t.kind),
    index("comment_reactions_user_idx").on(t.userId),
    index("comment_reactions_fingerprint_idx").on(t.fingerprint),
  ],
);

// --- notifications (SP3.3 point 7: reader inbox) ---
// Only logged-in users have an inbox (anonymous fingerprints aren't reliably addressable).
// `actorId` is the triggering identity token (userId OR fingerprint) — kept for display and
// for the comment_like dedup index, so repeated like/unlike by the same actor doesn't spam.
// `eventId` is a click-through convenience (notifications about comments link to the event).
// System notifications (source_approved) carry a null actorId. read_at IS NULL = unread.
export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(), // recipient (always a logged-in user)
    kind: notificationKindEnum("kind").notNull(),
    actorId: text("actor_id"), // who triggered it (userId or fingerprint); null = system
    title: text("title").notNull(),
    body: text("body"),
    targetType: text("target_type"), // 'event' | 'comment' | 'source'
    targetId: text("target_id"),
    eventId: text("event_id"), // click-through target for the reader UI, when applicable
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    // Partial unique for comment_like dedup is defined in SQL (migration 0015): drizzle's
    // uniqueIndex can't express the WHERE clause. See comment_reactions for the same pattern.
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

// --- llm_spend_ledger (spend_guard) ---
// Append-only receipt of every priced LLM call. month_to_date sum (per UTC month_key) is
// the input to the budget gate. UTC, not APP_TZ: vendor billing windows are UTC-defined
// and never align with APP_TZ. Stub / unpriced calls are not recorded (cost is $0 / unknown).
export const llmSpendLedger = pgTable(
  "llm_spend_ledger",
  {
    id: text("id").primaryKey(),
    // "YYYY-MM" UTC bucket — the only key the month-to-date range scan needs.
    monthKey: text("month_key").notNull(),
    task: text("task").notNull(), // LlmTask, e.g. "cold_judge"
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: doublePrecision("cost_usd").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("llm_spend_month_idx").on(t.monthKey)],
);

// --- feedback (anonymous reader feedback) ---
// Low-stakes inbox: anyone can submit, no account required. `contact` is optional and
// reader-supplied; `fingerprint` is a salted per-IP+UA hash kept only for abuse triage and
// never displayed. Append-only; triaged out-of-band (no public read path).
export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    body: text("body").notNull(),
    contact: text("contact"),
    fingerprint: text("fingerprint"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("feedback_created_idx").on(t.createdAt)],
);

// --- owner_annotations (点6 偏好标注) ---
// 主理人对事件/信源的有用性判决 — 不可变输入（行可改判但不删），偏好画像与打分修正由
// 确定性聚合推导（docs/annotation-preference-design.md）。单主理人产品：一对象一行。
export const ownerAnnotations = pgTable(
  "owner_annotations",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type", { enum: ["event", "source"] }).notNull(),
    subjectId: text("subject_id").notNull(),
    verdict: text("verdict", { enum: ["useful", "not_useful"] }).notNull(),
    note: text("note"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("owner_annotations_subject_uq").on(t.subjectType, t.subjectId),
    index("owner_annotations_created_idx").on(t.createdAt),
  ],
);

// better-auth tables live in auth-schema.ts; re-export so drizzle-kit emits their
// migrations from this single schema entrypoint (drizzle.config points here).
export { account, session, user, verification } from "./auth-schema";

// --- user_preferences (登录读者的默认信源筛选定制，借鉴 bestblogs) ---
// 一用户一行。default_source_ids 为空数组 = 已显式清空（不筛选）；行不存在 = 从未定制。
// 首页 SSR 在 URL 未带 sources 参数时应用该默认值。
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authUser.id, { onDelete: "cascade" }),
  defaultSourceIds: text("default_source_ids").array().notNull().default(sql`'{}'::text[]`),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// --- topic_boards (v0.5 A1: 读者自定义「关注主题」DIY 核心) ---
// 读者建/改/删自己的主题板；板 = 一组 tags[]，feed.searchEvents({tags}) 以数组重叠
// (events.tags && board.tags) 确定性匹配事件（哲学不变，无 embedding）。身份沿用
// event_reactions 的 XOR 形态：user_id（登录读者，持久跨端）XOR fingerprint（匿名 rid
// cookie，设备本地）。严格 XOR、每身份板名唯一由迁移 0027 的 CHECK + 部分唯一索引强制
// （drizzle 无法表达 num_nonnulls / COALESCE 唯一性，沿用 event_reactions 注释惯例）。
// tags 为空数组 = 不过滤（等于「全部动态」快照）。
export const topicBoards = pgTable(
  "topic_boards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => authUser.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint"),
    name: text("name").notNull(),
    emoji: text("emoji"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // A (v0.5): optional source scope. A board matches tags OR these sources (see feed interests).
    sourceIds: text("source_ids").array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("topic_boards_user_idx").on(t.userId, t.sortOrder),
    index("topic_boards_fingerprint_idx").on(t.fingerprint, t.sortOrder),
  ],
);

// --- llm_routing_overrides (v0.5 C1: 主理人可编辑的模型路由) ---
// 每任务一行，覆盖 src/llm/routing.ts 的静态 provider/model（仅这两项；promptVersion/
// token/temperature 仍由代码控制）。worker 侧内存缓存 + cron 刷新读取，resolveProvider 仍同步。
export const llmRoutingOverrides = pgTable("llm_routing_overrides", {
  task: text("task").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

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
  eventComments,
  commentReactions,
  notifications,
  auditLogs,
  llmSpendLedger,
  feedback,
  ownerAnnotations,
  userPreferences,
  topicBoards,
  llmRoutingOverrides,
};
