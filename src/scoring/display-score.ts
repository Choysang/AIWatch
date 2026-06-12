// Deterministic display_score (Scoring Integrity slice).
//
// Spec § Scoring System — public display_score decays toward the grade floor:
//
//   display_score =
//     grade_floor[level] +
//     (peak_score - grade_floor[level]) * decay(age_since_last_strong_signal)
//
// Where decay(age) = 0.5 ^ (age / half_life). Per spec: "Selected levels do not downgrade,
// but scores decay toward their floor and rank scores fall with time unless new strong
// signals arrive." Floors: B 75, A 86, S 94. Half-lives: B 3d, A 10d, S 30d.
//
// Behavior:
//   - level === "none" => no decay; return round(peakScore) clamped 0-100.
//   - peakScore <= floor => clamp to floor (the event is already at floor; no further decay).
//   - peakScore > floor => decays exponentially toward floor; never crosses it.
//
// Pure function. The "what is a strong signal" rule lives elsewhere (a writer of
// last_strong_signal_at); this function just consumes the timestamp.

import { scoringConfig, type ScoringConfig } from "./config";
import type { SelectedLevel } from "./types";

export interface DisplayScoreInputs {
  level: SelectedLevel;
  /** Highest promotion_score ever observed; null/undefined => fall back to qualityScore. */
  peakScore: number;
  /** Hours since last_strong_signal_at (or promoted_at if no signal since promotion). */
  ageSinceLastStrongSignalHours: number;
}

export interface DisplayScoreBreakdown {
  configVersion: string;
  level: SelectedLevel;
  peakScore: number;
  floor: number;
  ageHours: number;
  halfLifeHours: number;
  decayFactor: number;
  displayScore: number;
}

function halfLifeForLevel(level: SelectedLevel, config: ScoringConfig): number {
  // none-tier events don't decay; return a no-op half-life. Callers short-circuit on level.
  if (level === "none") return Number.POSITIVE_INFINITY;
  return config.decayHalfLifeDays[level] * 24;
}

function floorForLevel(level: SelectedLevel, config: ScoringConfig): number {
  if (level === "none") return 0;
  return config.gradeFloors[level];
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  const x = Math.round(n);
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

export function computeDisplayScore(
  inputs: DisplayScoreInputs,
  config: ScoringConfig = scoringConfig,
): { displayScore: number; breakdown: DisplayScoreBreakdown } {
  const { level, peakScore } = inputs;
  const ageHours = Math.max(0, inputs.ageSinceLastStrongSignalHours);
  const floor = floorForLevel(level, config);
  const halfLifeHours = halfLifeForLevel(level, config);

  if (level === "none") {
    const score = clampInt(peakScore, 0, 100);
    return {
      displayScore: score,
      breakdown: {
        configVersion: config.version,
        level,
        peakScore,
        floor,
        ageHours,
        halfLifeHours,
        decayFactor: 1,
        displayScore: score,
      },
    };
  }

  if (peakScore <= floor) {
    return {
      displayScore: clampInt(floor, 0, 100),
      breakdown: {
        configVersion: config.version,
        level,
        peakScore,
        floor,
        ageHours,
        halfLifeHours,
        decayFactor: 1,
        displayScore: clampInt(floor, 0, 100),
      },
    };
  }

  const decayFactor = Math.pow(0.5, ageHours / halfLifeHours);
  const raw = floor + (peakScore - floor) * decayFactor;
  const displayScore = clampInt(raw, 0, 100);
  return {
    displayScore,
    breakdown: {
      configVersion: config.version,
      level,
      peakScore,
      floor,
      ageHours,
      halfLifeHours,
      decayFactor,
      displayScore,
    },
  };
}
