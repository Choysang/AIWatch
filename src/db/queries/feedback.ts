// Feedback persistence. Thin insert over the validated submission; the route owns
// validation + rate limiting. Returns the new row id so the caller can echo a receipt.

import { newId } from "@/core/ids";
import { db as defaultDb, type DB } from "@/db/client";
import { feedback } from "@/db/schema";
import type { FeedbackSubmission } from "@/feedback/schema";
import { desc } from "drizzle-orm";

export async function createFeedback(
  input: FeedbackSubmission,
  fingerprint: string | null,
  db: DB = defaultDb,
): Promise<{ id: string }> {
  const id = newId("fbk");
  await db.insert(feedback).values({
    id,
    body: input.body,
    contact: input.contact ?? null,
    fingerprint,
  });
  return { id };
}

export interface FeedbackRow {
  id: string;
  body: string;
  contact: string | null;
  fingerprint: string | null;
  createdAt: Date;
}

export async function listFeedback(take = 100, db: DB = defaultDb): Promise<FeedbackRow[]> {
  return db
    .select({
      id: feedback.id,
      body: feedback.body,
      contact: feedback.contact,
      fingerprint: feedback.fingerprint,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .orderBy(desc(feedback.createdAt))
    .limit(take);
}
