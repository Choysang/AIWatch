// Zod validation for public contribution submissions (decision: validate all untrusted
// input at the boundary). The envelope is common; proposedChange is validated per-kind.
// parseSubmission throws on invalid input so the route can answer 400 deterministically.

import { z } from "zod";
import { KIND_TARGET, type ContributionKind, type ContributionTarget } from "./types";

const sourceRecommendation = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200).optional(),
  platform: z.string().max(40).optional(),
  categories: z.array(z.string().min(1).max(40)).max(10).optional(),
});

const changeSchemas: Record<ContributionKind, z.ZodTypeAny> = {
  source_recommendation: sourceRecommendation,
  source_metadata_fix: z.object({ field: z.string().min(1).max(60), value: z.string().max(2000) }),
  tag_category_suggestion: z
    .object({ tags: z.array(z.string().min(1).max(40)).max(20).optional(), category: z.string().max(40).optional() })
    .refine((v) => v.tags?.length || v.category, "tags or category required"),
  merge_association_suggestion: z.object({
    otherEventId: z.string().min(1).max(64),
    relation: z.enum(["same_event", "related"]).optional(),
  }),
  correction_report: z.object({ problem: z.string().min(1).max(2000), suggestion: z.string().max(2000).optional() }),
  documentation: z.object({ note: z.string().min(1).max(4000) }),
};

const KINDS = Object.keys(changeSchemas) as [ContributionKind, ...ContributionKind[]];

// Kinds that concern an existing object must carry its id.
const NEEDS_TARGET = new Set<ContributionKind>([
  "source_metadata_fix",
  "tag_category_suggestion",
  "merge_association_suggestion",
  "correction_report",
]);

const envelope = z.object({
  kind: z.enum(KINDS),
  targetId: z.string().min(1).max(64).optional(),
  reason: z.string().max(2000).optional(),
  contact: z.string().max(200).optional(),
  proposedChange: z.unknown(),
});

export interface ParsedSubmission {
  kind: ContributionKind;
  targetType: ContributionTarget;
  targetId?: string;
  reason?: string;
  contact?: string;
  proposedChange: unknown;
}

export function parseSubmission(input: unknown): ParsedSubmission {
  const env = envelope.parse(input);
  if (NEEDS_TARGET.has(env.kind) && !env.targetId) {
    throw new z.ZodError([
      { code: "custom", path: ["targetId"], message: `targetId required for ${env.kind}` },
    ]);
  }
  const proposedChange = changeSchemas[env.kind].parse(env.proposedChange);
  return {
    kind: env.kind,
    targetType: KIND_TARGET[env.kind],
    targetId: env.targetId,
    reason: env.reason,
    contact: env.contact,
    proposedChange,
  };
}
