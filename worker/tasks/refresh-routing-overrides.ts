// refresh-routing-overrides task (v0.5 C1): reload the DB routing overrides into the worker's
// in-memory cache so resolveProvider / getRouteConfig pick up owner edits. Runs every minute
// (cron) + once at boot. Best-effort: a load failure leaves the previous cache in place.

import type { Task } from "graphile-worker";
import { loadRoutingOverrides } from "@/db/queries/routing-overrides";
import { setRoutingOverrides } from "@/llm/routing-overrides";

/** Load overrides from the DB into the cache. Exported so the worker can prime it at boot. */
export async function refreshRoutingOverrides(): Promise<number> {
  const map = await loadRoutingOverrides();
  setRoutingOverrides(map);
  return map.size;
}

export const refreshRoutingOverridesTask: Task = async (_payload, helpers) => {
  const count = await refreshRoutingOverrides();
  helpers.logger.info(`[refresh-routing-overrides] loaded ${count} override(s)`);
};
