// Event resolution + creation. event_judgments and event_scores are append-only;
// the event row carries current_* pointers plus denormalized hot fields for fast reads.
// Creating an event writes judgment + score + membership + pointers in one transaction.

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB } from "@/db/client";
import { eventJudgments, eventPosts, events, eventScores, posts } from "@/db/schema";
import type { ColdJudge } from "@/pipeline/judge-schema";
import { hammingDistanceHex } from "@/pipeline/simhash";
import type { PromotedLevel, ScoreBreakdown, SourceLevel } from "@/scoring/types";

/**
 * Build the denormalized search blob stored on events.search_text. Concatenates the
 * reader-facing text of the current (main) judgment so the search box can run a single
 * trigram-indexed ILIKE. Kept in sync with the fields the old multi-column OR scanned.
 */
export function buildEventSearchText(judgment: ColdJudge): string {
  return [
    judgment.title,
    judgment.summary,
    judgment.oneSentenceSummary,
    judgment.detailedSummary,
    judgment.recommendationReason,
    judgment.category,
    ...judgment.tags,
    ...judgment.tools,
    ...judgment.people,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .slice(0, 4000);
}

/** Find an event already holding a post with this canonical URL (same-event merge). */
export async function findEventIdByCanonicalUrl(
  canonicalUrl: string,
  db: DB = defaultDb,
): Promise<string | null> {
  const rows = await db
    .select({ eventId: eventPosts.eventId })
    .from(eventPosts)
    .innerJoin(posts, eq(posts.id, eventPosts.postId))
    .where(eq(posts.canonicalUrl, canonicalUrl))
    .limit(1);
  return rows[0]?.eventId ?? null;
}

export async function attachPostToEvent(
  eventId: string,
  postId: string,
  relation: "same_event" | "related" = "same_event",
  db: DB = defaultDb,
): Promise<void> {
  await db
    .insert(eventPosts)
    .values({ eventId, postId, relation })
    .onConflictDoNothing();
}

const SIMHASH_HAMMING_THRESHOLD = 12;
const TEXT_SIMILARITY_THRESHOLD = 0.54;
const SAME_FOLD_TEXT_SIMILARITY_THRESHOLD = 0.5;
const MIN_SHARED_EVENT_TOKENS = 4;
const EVENT_TEXT_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "with",
  "from",
  "into",
  "that",
  "this",
  "they",
  "their",
  "will",
  "have",
  "has",
  "had",
  "new",
  "news",
  "update",
  "release",
  "launch",
  "announces",
  "announced",
  "发布",
  "推出",
  "上线",
  "更新",
  "宣布",
  "最新",
  "模型",
  "产品",
  "功能",
]);

function normalizeEventFoldText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#][\w.-]+/g, " ")
    .replace(/[^\p{Letter}\p{Number}.+#-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eventFoldTokenSet(text: string): Set<string> {
  const normalized = normalizeEventFoldText(text);
  const tokens = new Set<string>();

  for (const word of normalized.match(/[a-z0-9][a-z0-9.+#-]{1,}/g) ?? []) {
    if (!EVENT_TEXT_STOPWORDS.has(word)) tokens.add(word);
  }

  const cjk = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  for (let i = 0; i < cjk.length - 1; i++) {
    const token = `${cjk[i]}${cjk[i + 1]}`;
    if (!EVENT_TEXT_STOPWORDS.has(token)) tokens.add(token);
  }

  return tokens;
}

function isStrongSharedEventToken(token: string): boolean {
  return (
    /\d/.test(token) ||
    /^(gpt|claude|gemini|llama|sora|veo|imagen|grok|qwen|deepseek|mistral|midjourney|opus|sonnet|haiku|kimi|hunyuan|doubao)/i.test(
      token,
    )
  );
}

export function eventTextSimilarityForFold(a: string | null | undefined, b: string | null | undefined): {
  score: number;
  shared: number;
  strongShared: number;
} {
  const left = eventFoldTokenSet(a ?? "");
  const right = eventFoldTokenSet(b ?? "");
  if (left.size === 0 || right.size === 0) return { score: 0, shared: 0, strongShared: 0 };

  let shared = 0;
  let strongShared = 0;
  for (const token of left) {
    if (!right.has(token)) continue;
    shared++;
    if (isStrongSharedEventToken(token)) strongShared++;
  }

  if (shared === 0) return { score: 0, shared: 0, strongShared: 0 };
  const smaller = Math.min(left.size, right.size);
  const union = left.size + right.size - shared;
  const containment = shared / smaller;
  const jaccard = shared / union;
  return {
    score: containment * 0.8 + jaccard * 0.2,
    shared,
    strongShared,
  };
}

export function isLikelySameEventText(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold = TEXT_SIMILARITY_THRESHOLD,
): boolean {
  const similarity = eventTextSimilarityForFold(a, b);
  if (similarity.shared < MIN_SHARED_EVENT_TOKENS && similarity.strongShared < 2) return false;
  return similarity.score >= threshold;
}

function semanticFoldText(input: { title?: string | null; summary?: string | null }): string {
  return [input.title, input.summary]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("\n")
    .slice(0, 1200);
}

export function shouldReplaceMainPost(input: {
  currentPipelineScore: number | null;
  currentPublishedAt: Date | null;
  nextPipelineScore: number;
  nextPublishedAt: Date | null;
}): boolean {
  if (input.nextPublishedAt && !input.currentPublishedAt) return true;
  if (input.nextPublishedAt && input.currentPublishedAt) {
    if (input.nextPublishedAt.getTime() < input.currentPublishedAt.getTime()) return true;
    if (input.nextPublishedAt.getTime() > input.currentPublishedAt.getTime()) return false;
  }
  if (!input.nextPublishedAt && input.currentPublishedAt) return false;
  return input.nextPipelineScore > (input.currentPipelineScore ?? -1);
}

export async function findEventIdBySemanticFold(
  input: { foldKey: string; simhash: string; since: Date; title?: string | null; summary?: string | null },
  db: DB = defaultDb,
): Promise<string | null> {
  const incomingText = semanticFoldText(input);
  const exact = await db
    .select({ id: events.id, simhash: events.simhash, title: events.title, summary: events.summary })
    .from(events)
    .where(
      and(
        eq(events.foldKey, input.foldKey),
        gte(events.createdAt, input.since),
        sql`${events.simhash} is not null`,
      ),
    )
    .orderBy(desc(events.sourceCount), desc(events.pipelineScore), desc(events.createdAt))
    .limit(10);
  for (const candidate of exact) {
    if (hammingDistanceHex(input.simhash, candidate.simhash) <= SIMHASH_HAMMING_THRESHOLD) {
      return candidate.id;
    }
    if (
      incomingText &&
      isLikelySameEventText(
        incomingText,
        semanticFoldText(candidate),
        SAME_FOLD_TEXT_SIMILARITY_THRESHOLD,
      )
    ) {
      return candidate.id;
    }
  }

  const candidates = await db
    .select({ id: events.id, simhash: events.simhash, foldKey: events.foldKey, title: events.title, summary: events.summary })
    .from(events)
    .where(and(gte(events.createdAt, input.since), sql`${events.simhash} is not null`))
    .orderBy(desc(events.createdAt))
    .limit(400);

  let best: { id: string; distance: number; similarity: number } | null = null;
  for (const candidate of candidates) {
    const distance = hammingDistanceHex(input.simhash, candidate.simhash);
    const candidateText = semanticFoldText(candidate);
    const threshold =
      candidate.foldKey === input.foldKey
        ? SAME_FOLD_TEXT_SIMILARITY_THRESHOLD
        : TEXT_SIMILARITY_THRESHOLD;
    const textSimilarity =
      incomingText && isLikelySameEventText(incomingText, candidateText, threshold)
        ? eventTextSimilarityForFold(incomingText, candidateText).score
        : 0;
    if (distance <= SIMHASH_HAMMING_THRESHOLD || textSimilarity > 0) {
      if (
        !best ||
        textSimilarity > best.similarity ||
        (textSimilarity === best.similarity && distance < best.distance)
      ) {
        best = { id: candidate.id, distance, similarity: textSimilarity };
      }
    }
  }
  return best?.id ?? null;
}

export interface CreateEventInput {
  source: { id: string; level: SourceLevel };
  // media is denormalized onto the event (events holds the hot read fields the card needs):
  // the reader feed selects events.media, so the post's extracted image must ride along here
  // or it never reaches the card.
  post: { id: string; publishedAt: Date | null; media?: unknown };
  judgment: ColdJudge;
  routing: {
    provider: string;
    modelId: string;
    promptVersion: string;
    routingConfigVersion: string;
  };
  scoring: {
    configVersion: string;
    baseScore: number;
    qualityScore: number;
    rankScore: number;
    displayScore: number;
    breakdown: ScoreBreakdown;
  };
  /** scoring-v2 layers (SP4). Optional so legacy/test callers stay valid; when present the new
   *  event_scores columns + denormalized events fields are written. */
  scoringV2?: {
    eventQualityScore: number;
    confidenceScore: number;
    selectionScore: number;
    selectionMaxLevel: PromotedLevel;
  };
}

/** Create a fresh event from a post, with its first judgment + score, atomically. */
export async function createEventFromPost(
  input: CreateEventInput,
  db: DB = defaultDb,
): Promise<string> {
  const eventId = newId("evt");
  const judgmentId = newId("ej");
  const scoreId = newId("es");
  const { judgment, scoring } = input;

  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({
        displayTitle: judgment.title.slice(0, 200),
        titleSource: "ai_generated",
      })
      .where(eq(posts.id, input.post.id));

    await tx.insert(events).values({
      id: eventId,
      foldKey: judgment.fold.foldKey,
      simhash: judgment.fold.simhash,
      pipelineScore: judgment.aiScore,
      pipelineTier: judgment.tier,
      oneLineSummary: judgment.oneSentenceSummary,
      detailedSummary: judgment.detailedSummary,
      coreViewpoints: judgment.coreViewpoints,
      tools: judgment.tools,
      people: judgment.people,
      sourceCount: 1,
      title: judgment.title.slice(0, 200),
      summary: judgment.summary,
      recommendationReason: judgment.recommendationReason,
      category: judgment.category,
      searchText: buildEventSearchText(judgment),
      contentType: judgment.contentType,
      tags: judgment.tags,
      mainSourceId: input.source.id,
      mainPostId: input.post.id,
      media: input.post.media ?? null,
      qualityScore: Math.round(scoring.qualityScore),
      rankScore: scoring.rankScore,
      selectionScore: input.scoringV2?.selectionScore ?? null,
      confidenceScore: input.scoringV2?.confidenceScore ?? null,
      selectionMaxLevel: input.scoringV2?.selectionMaxLevel ?? null,
      publishedAt: input.post.publishedAt,
      lastStrongSignalAt: input.post.publishedAt,
    });

    await tx.insert(eventJudgments).values({
      id: judgmentId,
      eventId,
      provider: input.routing.provider,
      modelId: input.routing.modelId,
      promptVersion: input.routing.promptVersion,
      routingConfigVersion: input.routing.routingConfigVersion,
      triggerReason: "initial",
      triggerPostId: input.post.id,
      aiRelevance: judgment.aiRelevance,
      impact: judgment.impact,
      novelty: judgment.novelty,
      audienceUsefulness: judgment.audienceUsefulness,
      evidenceClarity: judgment.evidenceClarity,
      summary: judgment.summary,
      category: judgment.category,
      contentType: judgment.contentType,
      tags: judgment.tags,
      recommendationReason: judgment.recommendationReason,
      raw: judgment,
    });

    await tx.insert(eventScores).values({
      id: scoreId,
      eventId,
      scoringConfigVersion: scoring.configVersion,
      judgmentId,
      baseScore: scoring.baseScore,
      qualityScore: scoring.qualityScore,
      eventQualityScore: input.scoringV2?.eventQualityScore ?? null,
      confidenceScore: input.scoringV2?.confidenceScore ?? null,
      selectionScore: input.scoringV2?.selectionScore ?? null,
      selectionMaxLevel: input.scoringV2?.selectionMaxLevel ?? null,
      rankScore: scoring.rankScore,
      displayScore: scoring.displayScore,
      breakdown: scoring.breakdown,
    });

    await tx.insert(eventPosts).values({
      eventId,
      postId: input.post.id,
      relation: "same_event",
    });

    await tx
      .update(events)
      .set({
        currentJudgmentId: judgmentId,
        currentScoreId: scoreId,
        updatedAt: sql`now()`,
      })
      .where(eq(events.id, eventId));
  });

  return eventId;
}

export async function foldPostIntoEvent(
  eventId: string,
  input: CreateEventInput,
  db: DB = defaultDb,
): Promise<void> {
  const judgmentId = newId("ej");
  const scoreId = newId("es");
  const { judgment, scoring } = input;

  await db.transaction(async (tx) => {
    const current = await tx
      .select({ pipelineScore: events.pipelineScore, publishedAt: events.publishedAt })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    const replaceMain = shouldReplaceMainPost({
      currentPipelineScore: current[0]?.pipelineScore ?? null,
      currentPublishedAt: current[0]?.publishedAt ?? null,
      nextPipelineScore: judgment.aiScore,
      nextPublishedAt: input.post.publishedAt,
    });

    await tx
      .update(posts)
      .set({
        displayTitle: judgment.title.slice(0, 200),
        titleSource: "ai_generated",
      })
      .where(eq(posts.id, input.post.id));

    await tx.insert(eventPosts).values({
      eventId,
      postId: input.post.id,
      relation: "same_event",
    }).onConflictDoNothing();

    await tx.insert(eventJudgments).values({
      id: judgmentId,
      eventId,
      provider: input.routing.provider,
      modelId: input.routing.modelId,
      promptVersion: input.routing.promptVersion,
      routingConfigVersion: input.routing.routingConfigVersion,
      triggerReason: "initial",
      triggerPostId: input.post.id,
      aiRelevance: judgment.aiRelevance,
      impact: judgment.impact,
      novelty: judgment.novelty,
      audienceUsefulness: judgment.audienceUsefulness,
      evidenceClarity: judgment.evidenceClarity,
      summary: judgment.summary,
      category: judgment.category,
      contentType: judgment.contentType,
      tags: judgment.tags,
      recommendationReason: judgment.recommendationReason,
      raw: judgment,
    });

    await tx.insert(eventScores).values({
      id: scoreId,
      eventId,
      scoringConfigVersion: scoring.configVersion,
      judgmentId,
      baseScore: scoring.baseScore,
      qualityScore: scoring.qualityScore,
      eventQualityScore: input.scoringV2?.eventQualityScore ?? null,
      confidenceScore: input.scoringV2?.confidenceScore ?? null,
      selectionScore: input.scoringV2?.selectionScore ?? null,
      selectionMaxLevel: input.scoringV2?.selectionMaxLevel ?? null,
      rankScore: scoring.rankScore,
      displayScore: scoring.displayScore,
      breakdown: scoring.breakdown,
    });

    const common = {
      sourceCount: sql`(
        select greatest(1, count(distinct p.source_id))::int
        from event_posts ep
        join posts p on p.id = ep.post_id
        where ep.event_id = ${eventId}
      )`,
      updatedAt: sql`now()`,
    };

    if (!replaceMain) {
      await tx.update(events).set(common).where(eq(events.id, eventId));
      return;
    }

    await tx
      .update(events)
      .set({
        ...common,
        foldKey: judgment.fold.foldKey,
        simhash: judgment.fold.simhash,
        pipelineScore: judgment.aiScore,
        pipelineTier: judgment.tier,
        oneLineSummary: judgment.oneSentenceSummary,
        detailedSummary: judgment.detailedSummary,
        coreViewpoints: judgment.coreViewpoints,
        tools: judgment.tools,
        people: judgment.people,
        title: judgment.title.slice(0, 200),
        summary: judgment.summary,
        recommendationReason: judgment.recommendationReason,
        category: judgment.category,
        searchText: buildEventSearchText(judgment),
        contentType: judgment.contentType,
        tags: judgment.tags,
        mainSourceId: input.source.id,
        mainPostId: input.post.id,
        media: input.post.media ?? null,
        currentJudgmentId: judgmentId,
        currentScoreId: scoreId,
        qualityScore: Math.round(scoring.qualityScore),
        rankScore: scoring.rankScore,
        selectionScore: input.scoringV2?.selectionScore ?? null,
        confidenceScore: input.scoringV2?.confidenceScore ?? null,
        selectionMaxLevel: input.scoringV2?.selectionMaxLevel ?? null,
        publishedAt: input.post.publishedAt,
        lastStrongSignalAt: input.post.publishedAt,
      })
      .where(eq(events.id, eventId));
  });
}

/** Whether a post is already attached to any event (idempotency guard). */
export async function postHasEvent(postId: string, db: DB = defaultDb): Promise<boolean> {
  const rows = await db
    .select({ eventId: eventPosts.eventId })
    .from(eventPosts)
    .where(eq(eventPosts.postId, postId))
    .limit(1);
  return rows.length > 0;
}
