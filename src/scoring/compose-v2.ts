// Compose pure-function entry point for scoring-v2 (SP4 point 8).
//
// Mirrors compose.ts but assembles the layered model: relevance_gate → event_quality_score →
// confidence_score → selection_score, reusing the v1 aggregators for expert/comment/citation
// signals (they already produce 0-100 neutral-aware scores). Keeps the future job/handler call
// sites (stage 4.2) flat — they don't reach into individual layers.
//
// When the relevance gate fails, selection_score is forced to 0: the event still appears in the
// full feed, but is structurally excluded from the promotion tournament.

import {
  computeCitationQualityScore,
  type Citation,
  type CitationQualityBreakdown,
} from "./citation-quality";
import {
  computeCommentQualityScore,
  type CommentQualityBreakdown,
  type ValidComment,
} from "./comment-quality";
import {
  computeConfidenceScore,
  type ConfidenceBreakdown,
} from "./confidence-score";
import { scoringConfig, scoringV2Config, type ScoringConfig, type ScoringV2Config } from "./config";
import {
  computeEventQualityScore,
  type EventQualityBreakdown,
} from "./event-quality-score";
import {
  computeExpertValueScore,
  type ExpertAction,
  type ExpertValueBreakdown,
} from "./expert-value";
import {
  computeRelevanceGate,
  type RelevanceGateResult,
} from "./relevance-gate";
import {
  computeSelectionScore,
  type SelectionScoreBreakdown,
} from "./selection-score";
import type { ContentType } from "@/pipeline/judge-schema";
import type { LlmDimensions, PromotedLevel, SourceLevel } from "./types";

export interface ComposeV2Inputs {
  /** Whether the upstream $0 deterministic gate (core/gate.ts) passed. */
  zeroGatePassed: boolean;
  dimensions: LlmDimensions;
  sourceLevel: SourceLevel;
  /** Independent posts merged into this event (>=1). Drives multi-source corroboration. */
  sourcePostCount: number;
  expertActions: readonly ExpertAction[];
  validComments: readonly ValidComment[];
  /** Card/detail/original click count; default 0 for cold-start scoring. */
  viewCount?: number;
  /** Small selection lift for posts with both readable text and visible media. */
  hasTextAndMedia?: boolean;
  /** Optional — citations aren't tracked in V1 (defaults to neutral). */
  citations?: readonly Citation[];
  contentType: ContentType;
}

export interface ComposeV2Breakdown {
  configVersion: string;
  relevance: RelevanceGateResult;
  quality: EventQualityBreakdown;
  expertValue: ExpertValueBreakdown;
  confidence: ConfidenceBreakdown;
  commentQuality: CommentQualityBreakdown;
  citationQuality: CitationQualityBreakdown;
  selection: SelectionScoreBreakdown;
}

export interface ComposeV2Result {
  relevancePassed: boolean;
  qualityScore: number;
  expertValueScore: number;
  confidenceScore: number;
  commentQualityScore: number;
  citationQualityScore: number;
  selectionScore: number;
  maxLevel: PromotedLevel;
  breakdown: ComposeV2Breakdown;
}

export function composeScoresV2(
  inputs: ComposeV2Inputs,
  config: ScoringV2Config = scoringV2Config,
  v1Config: ScoringConfig = scoringConfig,
): ComposeV2Result {
  const relevance = computeRelevanceGate(
    { zeroGatePassed: inputs.zeroGatePassed, aiRelevance: inputs.dimensions.aiRelevance },
    config,
  );

  const quality = computeEventQualityScore(
    { sourceLevel: inputs.sourceLevel, dimensions: inputs.dimensions },
    config,
  );

  const expert = computeExpertValueScore({ actions: inputs.expertActions }, v1Config);
  const comment = computeCommentQualityScore({ comments: inputs.validComments }, v1Config);
  const citation = computeCitationQualityScore({ citations: inputs.citations }, v1Config);

  const confidence = computeConfidenceScore(
    {
      evidenceClarity: inputs.dimensions.evidenceClarity,
      sourceLevel: inputs.sourceLevel,
      sourcePostCount: inputs.sourcePostCount,
      expertValueScore: expert.expertValueScore,
    },
    config,
  );

  const selection = computeSelectionScore(
    {
      qualityScore: quality.qualityScore,
      confidenceScore: confidence.confidenceScore,
      commentQualityScore: comment.commentQualityScore,
      citationQualityScore: citation.citationQualityScore,
      viewCount: inputs.viewCount ?? 0,
      hasTextAndMedia: inputs.hasTextAndMedia ?? false,
      contentType: inputs.contentType,
    },
    config,
  );

  // Relevance gate is a hard exclusion from selection (the event still lives in the full feed).
  const selectionScore = relevance.passed ? selection.selectionScore : 0;

  return {
    relevancePassed: relevance.passed,
    qualityScore: quality.qualityScore,
    expertValueScore: expert.expertValueScore,
    confidenceScore: confidence.confidenceScore,
    commentQualityScore: comment.commentQualityScore,
    citationQualityScore: citation.citationQualityScore,
    selectionScore,
    maxLevel: selection.maxLevel,
    breakdown: {
      configVersion: config.version,
      relevance,
      quality: quality.breakdown,
      expertValue: expert.breakdown,
      confidence: confidence.breakdown,
      commentQuality: comment.breakdown,
      citationQuality: citation.breakdown,
      selection: selection.breakdown,
    },
  };
}
