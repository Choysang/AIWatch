// One-shot runner for the 点9 Chinese-title backfill. Usage (worker container):
//   bun run scripts/backfill-chinese-titles.ts [--limit=N]
import { backfillChineseText } from "@/pipeline/backfill-chinese-text";

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const limitRaw = Number(argValue("--limit="));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : undefined;
  const summary = await backfillChineseText({ limit });
  console.log("[backfill-zh]", JSON.stringify(summary));
  if (summary.noProvider || summary.budgetStopped) process.exit(1);
}

main().catch((error) => {
  console.error("[backfill-zh] failed:", error);
  process.exit(1);
});
