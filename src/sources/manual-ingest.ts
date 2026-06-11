// Manual-post ingestion (Task 3). Orchestrates the hand-entry path: load the target source,
// shape the validated form input into a RawPost, and run the SAME event-formation pipeline
// the worker uses (gate -> normalize -> dedup -> cold_judge -> score -> event). Reusing
// processSource means manual posts get identical judgment, scoring, dedup and spend-guard
// behavior as crawled ones — no parallel code path to drift.

import { db as defaultDb, type DB } from "@/db/client";
import { getSourceById } from "@/db/queries/sources";
import { processSource, type ProcessSummary, type ProcessDeps } from "@/pipeline/process-source";
import { toRawPost, type ManualPostInput } from "./manual-post";

/** Thrown when the target source id doesn't exist (operator passed a stale/typo id). */
export class SourceNotFoundError extends Error {}

export interface ManualIngestDeps extends ProcessDeps {
  db?: DB;
}

/**
 * Ingest one hand-entered post under an existing source. Returns the pipeline summary so the
 * caller can tell the operator what happened (new event / dropped by gate / duplicate /
 * judge_failed). Fail-closed judging still applies: with no LLM key and stub fallback off,
 * the post is persisted but marked judge_failed (no event) — surfaced via the summary.
 */
export async function ingestManualPost(
  sourceId: string,
  input: ManualPostInput,
  deps: ManualIngestDeps = {},
): Promise<ProcessSummary> {
  const db = deps.db ?? defaultDb;
  const source = await getSourceById(sourceId, db);
  if (!source) {
    throw new SourceNotFoundError(`source ${sourceId} not found`);
  }
  return processSource(source, [toRawPost(input)], { db, judge: deps.judge, incremental: false });
}
