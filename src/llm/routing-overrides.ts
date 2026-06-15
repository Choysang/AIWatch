// In-memory routing-override cache (v0.5 C1). The worker refreshes this from the DB on a
// cron (+ once at boot) so resolveProvider / getRouteConfig can read owner overrides
// synchronously on the judge hot path — no per-call DB hit, no async refactor. Pure: the DB
// loader lives in src/db/queries/routing-overrides.ts and calls setRoutingOverrides here.

import type { LlmProviderName, LlmTask } from "./routing";

export interface RoutingOverride {
  provider: LlmProviderName;
  model: string;
}

let cache: ReadonlyMap<LlmTask, RoutingOverride> = new Map();

/** Replace the whole override cache (worker refresh job + tests). */
export function setRoutingOverrides(next: ReadonlyMap<LlmTask, RoutingOverride>): void {
  cache = next;
}

/** The override for a task, or undefined when none is set. */
export function getRoutingOverride(task: LlmTask): RoutingOverride | undefined {
  return cache.get(task);
}

/** Test helper: reset the cache to empty. */
export function clearRoutingOverridesCache(): void {
  cache = new Map();
}
