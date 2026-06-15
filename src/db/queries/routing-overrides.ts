// LLM routing-override persistence (v0.5 C1). The owner edits these in /_admin/routing; the
// worker loads them into the in-memory cache (src/llm/routing-overrides.ts) on a cron so the
// judge hot path reads overrides synchronously. Stored as text — a valid LlmTask / provider
// is enforced at the write boundary, and getRouteConfig re-validates the provider on read.

import { eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { llmRoutingOverrides } from "@/db/schema";
import type { LlmTask } from "@/llm/routing";
import type { RoutingOverride } from "@/llm/routing-overrides";

export interface RoutingOverrideRow {
  task: string;
  provider: string;
  model: string;
  updatedBy: string | null;
  updatedAt: Date;
}

export async function listRoutingOverrides(db: DB = defaultDb): Promise<RoutingOverrideRow[]> {
  return db.select().from(llmRoutingOverrides);
}

/** Load all overrides into the Map shape the cache wants. */
export async function loadRoutingOverrides(
  db: DB = defaultDb,
): Promise<Map<LlmTask, RoutingOverride>> {
  const rows = await db.select().from(llmRoutingOverrides);
  const map = new Map<LlmTask, RoutingOverride>();
  for (const row of rows) {
    map.set(row.task as LlmTask, {
      provider: row.provider as RoutingOverride["provider"],
      model: row.model,
    });
  }
  return map;
}

export async function upsertRoutingOverride(
  task: string,
  provider: string,
  model: string,
  updatedBy: string | null,
  db: DB = defaultDb,
): Promise<void> {
  const now = new Date();
  await db
    .insert(llmRoutingOverrides)
    .values({ task, provider, model, updatedBy, updatedAt: now })
    .onConflictDoUpdate({
      target: llmRoutingOverrides.task,
      set: { provider, model, updatedBy, updatedAt: now },
    });
}

export async function deleteRoutingOverride(task: string, db: DB = defaultDb): Promise<void> {
  await db.delete(llmRoutingOverrides).where(eq(llmRoutingOverrides.task, task));
}
