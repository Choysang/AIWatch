// Scoring domain types. Framework-agnostic; imported by both web and worker.

export type Platform =
  | "x"
  | "github"
  | "reddit"
  | "hackernews"
  | "blog"
  | "zhihu"
  | "csdn"
  | "rss"
  | "news"
  | "youtube"
  | "bilibili"
  | "huggingface"
  | "weibo";

export type SourceLevel = "L1" | "L2" | "L3" | "L4" | "L5";

/** Selected level on an event. `none` = not selected; B/A/S are daily/weekly/monthly. */
export type SelectedLevel = "none" | "B" | "A" | "S";
/** The promotable tiers (excludes `none`). */
export type PromotedLevel = "B" | "A" | "S";

export interface PublicMetrics {
  likes?: number;
  reposts?: number;
  replies?: number;
  stars?: number;
  comments?: number;
}

/** LLM-produced, immutable structured judgment dimensions (0-100). */
export interface LlmDimensions {
  aiRelevance: number;
  impact: number;
  novelty: number;
  audienceUsefulness: number;
  evidenceClarity: number;
}

export interface BaseWeights {
  source: number;
  aiRelevance: number;
  impact: number;
  novelty: number;
  externalHeat: number;
  userValue: number;
  expertValue: number;
}

export interface BaseScoreInputs {
  sourceLevel: SourceLevel;
  dimensions: LlmDimensions;
  /** Deterministic, normalized 0-100 (see externalHeatScore). */
  externalHeat: number;
  /** 0-100; defaults to config.expertValueNeutral when omitted (no expert signal yet). */
  expertValue?: number;
}

export interface ScoreBreakdown {
  configVersion: string;
  inputs: {
    sourceScore: number;
    aiRelevance: number;
    impact: number;
    novelty: number;
    externalHeat: number;
    userValue: number;
    expertValue: number;
  };
  weights: BaseWeights;
  components: Record<string, number>;
  baseScore: number;
}
