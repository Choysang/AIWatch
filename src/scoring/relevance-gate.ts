// Deterministic relevance_gate (scoring-v2, SP4 point 8).
//
// A HARD gate, not a weighted term. An event passes only when the $0 deterministic gate
// (core/gate.ts) passed AND the LLM aiRelevance dimension meets the configured floor.
// Events that fail still appear in the full feed, but selection_score is forced to 0 by the
// caller — they can never enter the精选/promotion tournament.
//
// Open point A1 (locked): the floor looks at aiRelevance only, keeping a single clear gate.

import { scoringV2Config, type ScoringV2Config } from "./config";

export interface RelevanceGateInputs {
  /** Whether the upstream $0 deterministic gate (core/gate.ts) passed for this event. */
  zeroGatePassed: boolean;
  /** LLM aiRelevance dimension, 0-100. */
  aiRelevance: number;
}

export type RelevanceGateReason = "ok" | "zero_gate" | "below_relevance_min";

export interface RelevanceGateResult {
  passed: boolean;
  reason: RelevanceGateReason;
  relevanceMin: number;
  configVersion: string;
}

export function computeRelevanceGate(
  inputs: RelevanceGateInputs,
  config: ScoringV2Config = scoringV2Config,
): RelevanceGateResult {
  const relevanceMin = config.relevanceMin;
  let reason: RelevanceGateReason = "ok";
  if (!inputs.zeroGatePassed) {
    reason = "zero_gate";
  } else if (inputs.aiRelevance < relevanceMin) {
    reason = "below_relevance_min";
  }
  return {
    passed: reason === "ok",
    reason,
    relevanceMin,
    configVersion: config.version,
  };
}
