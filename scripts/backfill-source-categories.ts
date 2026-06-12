// Fill sources.categories with the AIWatch source taxonomy for legacy rows.
// Safe to re-run: sources that already carry a known taxonomy category are skipped.

import { eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { sources } from "@/db/schema";
import {
  AI_SOURCE_CATEGORY_LABEL,
  inferAiSourceCategory,
  normalizeAiSourceCategories,
} from "@/sources/ai-source-categories";

async function main(): Promise<void> {
  const rows = await db
    .select({
      id: sources.id,
      name: sources.name,
      handle: sources.handle,
      url: sources.url,
      platform: sources.platform,
      sourceType: sources.sourceType,
      level: sources.level,
      categories: sources.categories,
    })
    .from(sources);

  let updated = 0;
  for (const row of rows) {
    const inferred = inferAiSourceCategory({
      sourceType: row.sourceType,
      level: row.level,
      platform: row.platform,
      name: row.name,
      handle: row.handle,
      url: row.url,
    });
    const existing = normalizeAiSourceCategories(row.categories);
    if (existing.length > 0) {
      const desired = existing.length === 1 && existing[0] !== inferred ? [inferred] : existing;
      const alreadyCanonical =
        row.categories.length === desired.length &&
        desired.every((category, index) => row.categories[index] === category);
      if (alreadyCanonical) continue;

      await db.update(sources).set({ categories: desired }).where(eq(sources.id, row.id));
      updated += 1;
      // eslint-disable-next-line no-console -- script output
      console.log(`[source-category] ${row.name} -> ${desired.map((category) => AI_SOURCE_CATEGORY_LABEL[category]).join(", ")}`);
      continue;
    }

    await db.update(sources).set({ categories: [inferred] }).where(eq(sources.id, row.id));
    updated += 1;
    // eslint-disable-next-line no-console -- script output
    console.log(`[source-category] ${row.name} -> ${AI_SOURCE_CATEGORY_LABEL[inferred]}`);
  }

  // eslint-disable-next-line no-console -- script output
  console.log(`[source-category] updated ${updated}/${rows.length} sources`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console -- script output
    console.error("[source-category] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
