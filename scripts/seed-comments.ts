// Demo-only: drops a few reader comments onto the most recent events so the homepage
// card comment-ticker has something to rotate. Uses the real addComment path (same
// classifier + dedupe as production). Anonymous fingerprint identities. Idempotent.

import { desc } from "drizzle-orm";
import { addComment } from "@/db/queries/comments";
import { db, pool } from "@/db/client";
import { events } from "@/db/schema";

const SAMPLE: string[] = [
  "这次更新的推理速度提升很明显，实测延迟低了不少。",
  "成本下降是关键，终于能大规模铺到生产环境了。",
  "对比上一代，长上下文的稳定性好了很多。",
  "期待开源权重，社区生态会因此爆发。",
  "API 兼容性做得不错，迁移几乎零成本。",
  "多模态的表现超预期，语音延迟感人。",
];

async function main(): Promise<void> {
  const recent = await db
    .select({ id: events.id })
    .from(events)
    .orderBy(desc(events.createdAt))
    .limit(8);

  let added = 0;
  for (const [i, ev] of recent.entries()) {
    // 3 rotating comments per event, deterministic pick from the sample pool.
    for (let k = 0; k < 3; k++) {
      const body = SAMPLE[(i + k) % SAMPLE.length]!;
      await addComment({
        eventId: ev.id,
        body,
        identity: { userId: null, fingerprint: `demo-reader-${(i + k) % 4}` },
      });
      added++;
    }
  }
  // eslint-disable-next-line no-console -- script output
  console.log(`[seed-comments] added/ensured ${added} comments across ${recent.length} events`);
  await pool.end();
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- fatal
  console.error("[seed-comments] failed:", error);
  process.exit(1);
});
