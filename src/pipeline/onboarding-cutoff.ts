import type { RawPost } from "@/connectors/types";

export interface SourceOnboardingCutoff {
  onboardedAt?: Date | null;
}

export function isBeforeSourceOnboarding(source: SourceOnboardingCutoff, raw: RawPost): boolean {
  if (!source.onboardedAt || !raw.publishedAt) return false;
  return raw.publishedAt.getTime() < source.onboardedAt.getTime();
}
