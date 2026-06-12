// Deterministic expert_value_score (Scoring Integrity slice).
//
// Aggregates real expert actions on an event — stars and likes from users whose role gives
// them expert weight, projected onto a 0-100 scale via log saturation. Spec § Scoring:
// "expert_value_score comes only from real expert actions; the LLM may not impersonate an
// expert." When no expert has acted the score returns config.expertValueNeutral (50), the
// same "no signal" baseline used by cold-start base_score.
//
// Inputs are pre-joined (event_reactions × user) so this stays a pure function.
//
// Weighting rationale:
//   - Stars outweigh likes (star = intentional bookmark; like = ambient).
//   - Domain match doubles weight (an AI expert starring an AI event is stronger evidence
//     than the same expert starring a non-AI piece — spec: "Expert votes are weighted by
//     role and domain").
//   - expertWeight column scales each user's contribution. Default 1.0; admins raise/lower.

import { scoringConfig, type ScoringConfig } from "./config";

/** A single expert action joined with the actor's role + weight. */
export interface ExpertAction {
  kind: "like" | "star";
  /** RBAC role (auth-schema.user.role). Only `expert | moderator | admin | owner` count. */
  role: string;
  /** user.expert_weight; multiplier on this action. Non-positive values are treated as 0. */
  expertWeight: number;
  /**
   * True when at least one of the user's `expert_domain` strings matches the event category
   * (case-insensitive exact). Boosts contribution per the spec's domain rule.
   */
  domainMatch: boolean;
}

export interface ExpertValueInputs {
  /** All expert-eligible actions on this event. Empty => returns expertValueNeutral. */
  actions: readonly ExpertAction[];
}

export interface ExpertValueBreakdown {
  configVersion: string;
  actionCount: number;
  weightedLikes: number;
  weightedStars: number;
  totalWeight: number;
  expertValueScore: number;
  /** True when no expert acted; score === expertValueNeutral. */
  cold: boolean;
}

const EXPERT_ROLES = new Set(["expert", "moderator", "admin", "owner"]);
const STAR_VALUE = 3; // a star = ~3 likes worth of signal
const LIKE_VALUE = 1;
const DOMAIN_BOOST = 2; // domain match doubles weight
/** Total weighted signal at which expertValueScore saturates near 100. */
const SATURATION = 8;

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function saturate(weight: number, saturation: number): number {
  if (weight <= 0 || saturation <= 0) return 0;
  return clamp01(Math.log1p(weight) / Math.log1p(saturation));
}

export function computeExpertValueScore(
  inputs: ExpertValueInputs,
  config: ScoringConfig = scoringConfig,
): { expertValueScore: number; breakdown: ExpertValueBreakdown } {
  let weightedLikes = 0;
  let weightedStars = 0;

  for (const a of inputs.actions) {
    if (!EXPERT_ROLES.has(a.role)) continue;
    const w = Math.max(0, a.expertWeight) * (a.domainMatch ? DOMAIN_BOOST : 1);
    if (w === 0) continue;
    if (a.kind === "star") weightedStars += w * STAR_VALUE;
    else if (a.kind === "like") weightedLikes += w * LIKE_VALUE;
  }

  const totalWeight = weightedLikes + weightedStars;
  if (totalWeight === 0) {
    return {
      expertValueScore: config.expertValueNeutral,
      breakdown: {
        configVersion: config.version,
        actionCount: inputs.actions.length,
        weightedLikes: 0,
        weightedStars: 0,
        totalWeight: 0,
        expertValueScore: config.expertValueNeutral,
        cold: true,
      },
    };
  }

  const norm = saturate(totalWeight, SATURATION);
  const expertValueScore = Math.round(norm * 100);
  return {
    expertValueScore,
    breakdown: {
      configVersion: config.version,
      actionCount: inputs.actions.length,
      weightedLikes,
      weightedStars,
      totalWeight,
      expertValueScore,
      cold: false,
    },
  };
}
