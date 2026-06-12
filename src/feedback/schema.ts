// Feedback submission validation (boundary). Pure + framework-agnostic so the API route
// and tests share one source of truth. Body is required and length-bounded; contact is
// optional. Whitespace-only body is rejected after trimming.

import { z } from "zod";

export const MAX_FEEDBACK_BODY = 4000;
export const MAX_FEEDBACK_CONTACT = 200;

export const feedbackSubmissionSchema = z.object({
  body: z.string().trim().min(1).max(MAX_FEEDBACK_BODY),
  contact: z
    .string()
    .trim()
    .max(MAX_FEEDBACK_CONTACT)
    .optional()
    // Normalize an empty/whitespace contact to undefined so the column stays null.
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;

/** Parse + validate an untrusted submission. Throws ZodError on invalid input. */
export function parseFeedbackSubmission(input: unknown): FeedbackSubmission {
  return feedbackSubmissionSchema.parse(input);
}
