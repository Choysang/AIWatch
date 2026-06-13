// `bun run scripts/reset-source-health.ts [platform]` — revive sources that the crawler
// auto-disabled/degraded after repeated failures, once the underlying cause is fixed (e.g.
// a refreshed TWITTER_AUTH_TOKEN). Resets health_status→healthy, failure_count→0, last_error
// →null and makes them due now, so the next crawl tick picks them up. Writes one audit_logs
// row per revived source. Optional first arg filters by platform (e.g. `x`); omitted = all.
//
// Run in prod via the pulled image, no mounts:
//   docker compose -p aiwatch -f docker-compose.prod.yml run --rm --no-deps worker \
//     bun run scripts/reset-source-health.ts x

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { auditLogs, sources } from "@/db/schema";
import { db, pool } from "@/db/client";

async function main(): Promise<void> {
  const platform = process.argv[2]?.trim();
  const conds = [inArray(sources.healthStatus, ["disabled", "degraded"])];
  if (platform) {
    conds.push(eq(sources.platform, platform as (typeof sources.platform.enumValues)[number]));
  }

  const stale = await db
    .select({ id: sources.id, name: sources.name, status: sources.healthStatus })
    .from(sources)
    .where(and(...conds, ne(sources.healthStatus, "paused")));

  if (stale.length === 0) {
    // eslint-disable-next-line no-console -- script output
    console.log(`[reset-source-health] nothing to revive${platform ? ` for platform=${platform}` : ""}`);
    await pool.end();
    return;
  }

  for (const row of stale) {
    await db
      .update(sources)
      .set({
        healthStatus: "healthy",
        failureCount: 0,
        lastError: null,
        nextFetchAt: sql`now()`,
      })
      .where(eq(sources.id, row.id));
    await db.insert(auditLogs).values({
      id: newId("aud"),
      action: "source_health_reset",
      actorId: null,
      targetType: "source",
      targetId: row.id,
      before: { healthStatus: row.status },
      after: { healthStatus: "healthy" },
      reason: "manual revive after upstream fix",
    });
    // eslint-disable-next-line no-console -- script output
    console.log(`[reset-source-health] revived ${row.name} (was ${row.status})`);
  }

  // eslint-disable-next-line no-console -- script output
  console.log(`[reset-source-health] revived ${stale.length} source(s)`);
  await pool.end();
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- fatal
  console.error("[reset-source-health] failed:", error);
  process.exit(1);
});
