import { getOrExtractFulltext } from "@/db/queries/article-fulltext";
import type { BriefItem } from "@/db/queries/brief";

const FULLTEXT_CONCURRENCY = 4;

export async function hydrateBriefItemsWithFulltext(
  items: readonly BriefItem[],
): Promise<BriefItem[]> {
  const result = items.map((item) => ({ ...item }));
  let cursor = 0;

  async function worker() {
    while (cursor < result.length) {
      const index = cursor;
      cursor++;
      const item = result[index];
      if (!item || item.full_text || item.full_blocks.length > 0 || !item.url) continue;
      const full = await getOrExtractFulltext(item.id);
      if (full.status !== "ok") continue;
      result[index] = {
        ...item,
        body: full.text,
        full_text: full.text,
        full_blocks: full.blocks,
      };
    }
  }

  const count = Math.min(FULLTEXT_CONCURRENCY, result.length);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return result;
}
