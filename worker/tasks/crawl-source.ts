// crawl-source task: fetch one source via its connector, run the event-formation
// pipeline, and record the crawl outcome (success resets the breaker; failure trips it).

import type { Task } from "graphile-worker";
import { z } from "zod";
import { getConnector } from "@/connectors/registry";
import { getSourceById, markSourceFailure, markSourceSuccess } from "@/db/queries/sources";
import { processSource } from "@/pipeline/process-source";

const payloadSchema = z.object({ sourceId: z.string() });

export const crawlSource: Task = async (rawPayload, helpers) => {
  const { sourceId } = payloadSchema.parse(rawPayload);
  const source = await getSourceById(sourceId);
  if (!source) {
    helpers.logger.warn(`[crawl-source] source ${sourceId} not found; skipping`);
    return;
  }

  try {
    const connector = getConnector(source.connectorType);
    const rawPosts = await connector.fetch(source);
    const summary = await processSource(source, rawPosts);
    await markSourceSuccess(sourceId);
    helpers.logger.info(`[crawl-source] ${sourceId} ${JSON.stringify(summary)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markSourceFailure(sourceId, message);
    throw error; // surface to graphile-worker for retry/backoff bookkeeping
  }
};
