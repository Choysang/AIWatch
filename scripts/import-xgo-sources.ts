// Import X/Twitter RSS sources from an OPML/text export containing api.xgo.ing feed URLs.
//
// Usage:
//   bun run scripts/import-xgo-sources.ts path/to/sources.opml --dry-run
//   bun run scripts/import-xgo-sources.ts path/to/sources.opml
//   bun run scripts/import-xgo-sources.ts path/to/sources.opml --update-existing
//   bun run scripts/import-xgo-sources.ts path/to/sources.opml --replace
//   bun run scripts/import-xgo-sources.ts path/to/sources.opml --dry-run --limit=20

import { XMLParser } from "fast-xml-parser";
import type { SourceLevel } from "@/scoring/types";
import { tierFetchFrequency } from "@/sources/tiers";
import {
  AI_SOURCE_CATEGORY_LABEL,
  AI_SOURCE_CATEGORY_META,
  inferAiSourceCategory,
  type AiSourceCategory,
} from "@/sources/ai-source-categories";

type SourcePriority = "P0" | "P2" | "P3";

interface Candidate {
  name: string;
  handle: string;
  xmlUrl: string;
  homeUrl: string;
  priority: SourcePriority | null;
  priorityTitle: string | null;
  order: number;
}

interface ClassifiedCandidate extends Candidate {
  category: AiSourceCategory;
  reason: string;
}

const XGO_USER_RE = /https:\/\/api\.xgo\.ing\/rss\/user\/[^\s"'<>]+/g;
const OUTLINE_TAG_RE = /<outline\b[^>]*>/gi;
const ATTR_RE = /\s([A-Za-z][A-Za-z0-9_-]*)="([^"]*)"/g;
const PRIORITY_GROUP_RE = /^P([023])\s*(.*)$/i;

const PRIORITY_META: Record<SourcePriority, { level: SourceLevel; label: string; reason: string }> = {
  P0: {
    level: "L1",
    label: "P0 无条件精读",
    reason: "P0 无条件精读，绕过普通观察优先级，每条都值得认真处理。",
  },
  P2: {
    level: "L2",
    label: "P2 一手源异常检测",
    reason: "P2 一手源异常检测，主要用于扫标题和发现多源重合信号。",
  },
  P3: {
    level: "L3",
    label: "P3 踩坑观察哨",
    reason: "P3 踩坑观察哨，用于观察独立开发者和实践者的一线反馈。",
  },
};

const CATEGORY_RULES: Array<{
  category: AiSourceCategory;
  pattern: RegExp;
  reason: string;
}> = [
  {
    category: "official",
    pattern: /\b(openai|chatgpt|anthropic|claude|googledeepmind|googleai|gemini|mistralai|cohere|xai|metaai|aiatmeta|qwen|deepseek|hunyuan|txhunyuan|moonshot|minimax|zhipu|microsoftai|msftresearch)\b/i,
    reason: "官方实验室/大厂账号，适合作为一手发布源。",
  },
  {
    category: "technical_share",
    pattern: /\b(langchain|llamaindex|github|huggingface|replicate|vercel|cursor|windsurf|wandb|weaviate|pinecone|supabase|aisdk|sdk|replit|openrouter|ollama|cline|continue|browser[_ ]use|dify|milvus|v0)\b/i,
    reason: "AI 开发工具或基础设施账号，适合跟踪工程生态变化。",
  },
  {
    category: "official",
    pattern: /\b(runway|midjourney|elevenlabs|heygen|suno|udio|gamma|lovable|perplexity|notion|canva|descript)\b/i,
    reason: "垂直 AI 产品账号，适合跟踪产品发布与场景落地。",
  },
  {
    category: "industry_leader",
    pattern: /\b(sama|sam altman|gdb|karpathy|darioamodei|dario amodei|ylecun|demishassabis|ilyasut|andrewyng|fchollet|sundarpichai|jeffdean|thom_wolf)\b/i,
    reason: "行业核心人物账号，适合捕捉观点、路线和一手解释。",
  },
  {
    category: "technical_share",
    pattern: /\b(lilianweng|drjimfan|dotey|alexalbert|justinlin610|omarsar0|lijigang|op7418|simonw|_philschmid|martinfowler)\b/i,
    reason: "一线研究/工程实践账号，适合捕捉技术细节、踩坑和高质量解释。",
  },
  {
    category: "industry_leader",
    pattern: /\b(a16z|sequoia|ycombinator|paulg|levelsio|investor|vc|founder|startup|builder)\b/i,
    reason: "创投/创业生态账号，适合观察融资、产品化与机会判断。",
  },
  {
    category: "technical_share",
    pattern: /\b(news|daily|digest|rundown|decoder|bensbites|breakfast|newsletter|media|verge|techcrunch|aidotengineer|ai engineer)\b/i,
    reason: "资讯聚合或媒体账号，适合补充行业报道与线索发现。",
  },
];

function usage(): never {
  // eslint-disable-next-line no-console -- script output
  console.error("Usage: bun run scripts/import-xgo-sources.ts <opml-or-text-file> [--dry-run] [--update-existing] [--replace]");
  process.exit(1);
}

function attrString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function handleFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.replace(/&amp;/g, "&"));
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.findIndex((part) => part === "user");
    const handle = index >= 0 ? parts[index + 1] : null;
    return handle ? decodeURIComponent(handle).replace(/^@/, "") : null;
  } catch {
    return null;
  }
}

function decodeXmlText(raw: string): string {
  return raw
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .trim();
}

function handleFromName(rawName: string | undefined): string | null {
  if (!rawName) return null;
  const match = rawName.match(/\(@([A-Za-z0-9_]+)\)/) ?? rawName.match(/@([A-Za-z0-9_]+)/);
  return match?.[1] ?? null;
}

function homeUrlForHandle(handle: string): string {
  return `https://x.com/${handle.replace(/^@/, "")}`;
}

function nameFromText(raw: string | undefined, handle: string): string {
  const text = decodeXmlText(raw ?? "").replace(/\s*\(@?[^)]+\)\s*$/, "").trim();
  return text || handle;
}

function parsePriorityGroup(raw: string | undefined): { priority: SourcePriority; title: string } | null {
  if (!raw) return null;
  const text = decodeXmlText(raw);
  const match = text.match(PRIORITY_GROUP_RE);
  if (!match) return null;
  const priority = `P${match[1]}` as SourcePriority;
  return {
    priority,
    title: text || PRIORITY_META[priority].label,
  };
}

function addCandidate(
  seen: Set<string>,
  candidates: Candidate[],
  rawUrl: string,
  rawName?: string,
  priority: SourcePriority | null = null,
  priorityTitle: string | null = null,
): void {
  const xmlUrl = rawUrl.replace(/&amp;/g, "&").trim();
  const feedHandle = handleFromUrl(xmlUrl);
  if (!feedHandle) return;
  const handle = handleFromName(rawName) ?? feedHandle;
  const handleKey = `handle:${handle.toLowerCase()}`;
  const urlKey = `url:${xmlUrl.toLowerCase()}`;
  if (seen.has(handleKey) || seen.has(urlKey)) return;
  seen.add(handleKey);
  seen.add(urlKey);
  candidates.push({
    name: nameFromText(rawName, handle),
    handle,
    xmlUrl,
    homeUrl: homeUrlForHandle(handle),
    priority,
    priorityTitle,
    order: candidates.length,
  });
}

function parseOutlineTag(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(ATTR_RE)) {
    attrs[match[1]!] = decodeXmlText(match[2]!);
  }
  return attrs;
}

function collectOutlines(node: unknown, seen: Set<string>, candidates: Candidate[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectOutlines(item, seen, candidates);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const xmlUrl = attrString(record.xmlUrl) ?? attrString(record.xmlurl);
  if (xmlUrl?.includes("api.xgo.ing/rss/user/")) {
    addCandidate(seen, candidates, xmlUrl, attrString(record.text) ?? attrString(record.title));
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") collectOutlines(value, seen, candidates);
  }
}

function parseCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  let currentPriority: SourcePriority | null = null;
  let currentPriorityTitle: string | null = null;

  for (const match of text.matchAll(OUTLINE_TAG_RE)) {
    const attrs = parseOutlineTag(match[0]);
    const label = attrs.text ?? attrs.title;
    const group = parsePriorityGroup(label);
    const xmlUrl = attrs.xmlUrl ?? attrs.xmlurl;
    if (!xmlUrl && group) {
      currentPriority = group.priority;
      currentPriorityTitle = group.title;
      continue;
    }
    if (xmlUrl?.includes("api.xgo.ing/rss/user/")) {
      addCandidate(seen, candidates, xmlUrl, label, currentPriority, currentPriorityTitle);
    }
  }

  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    collectOutlines(parser.parse(text), seen, candidates);
  } catch {
    // OPML parsing is best-effort; regex fallback below handles pasted text.
  }

  for (const match of text.matchAll(OUTLINE_TAG_RE)) {
    const attrs = parseOutlineTag(match[0]);
    const xmlUrl = attrs.xmlUrl ?? attrs.xmlurl;
    if (xmlUrl?.includes("api.xgo.ing/rss/user/")) {
      addCandidate(seen, candidates, xmlUrl, attrs.text ?? attrs.title);
    }
  }

  for (const match of text.matchAll(XGO_USER_RE)) {
    addCandidate(seen, candidates, match[0]);
  }

  return candidates.sort((a, b) => a.order - b.order);
}

function classify(candidate: Candidate): ClassifiedCandidate {
  const haystack = `${candidate.name} ${candidate.handle} ${candidate.homeUrl}`;
  const rule = CATEGORY_RULES.find((item) => item.pattern.test(haystack));
  const category = rule?.category ?? inferAiSourceCategory({
    platform: "x",
    name: candidate.name,
    handle: candidate.handle,
    url: candidate.homeUrl,
  });
  return {
    ...candidate,
    category,
    reason: [
      candidate.priority ? PRIORITY_META[candidate.priority].reason : null,
      rule?.reason ?? `${AI_SOURCE_CATEGORY_LABEL[category]}账号，需在后台审核后持续观察贡献质量。`,
    ].filter(Boolean).join(" "),
  };
}

let openedDb = false;

async function dbImports() {
  openedDb = true;
  return Promise.all([
    import("drizzle-orm"),
    import("@/core/ids"),
    import("@/db/client"),
    import("@/db/schema"),
  ]);
}

function effectiveLevel(item: ClassifiedCandidate): SourceLevel {
  if (item.priority) return PRIORITY_META[item.priority].level;
  return AI_SOURCE_CATEGORY_META[item.category].level;
}

async function activeSourceIds(): Promise<string[]> {
  const [{ isNull }, , { db }, { sources }] = await dbImports();
  const rows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(isNull(sources.archivedAt));
  return rows.map((row) => row.id);
}

async function archiveActiveSources(): Promise<number> {
  const [{ isNull, sql }, , { db }, { sources }] = await dbImports();
  const rows = await db
    .update(sources)
    .set({
      enabled: false,
      archivedAt: sql`now()`,
      healthStatus: "disabled",
      updatedAt: sql`now()`,
    })
    .where(isNull(sources.archivedAt))
    .returning({ id: sources.id });
  return rows.length;
}

async function upsertCandidate(item: ClassifiedCandidate, updateExisting: boolean): Promise<"created" | "updated" | "skipped"> {
  const [{ eq, or, sql }, { newId }, { db }, { sources }] = await dbImports();
  const existing = await db
    .select({ id: sources.id })
    .from(sources)
    .where(or(eq(sources.connectorRef, item.xmlUrl), eq(sources.url, item.homeUrl)))
    .limit(1);

  const meta = AI_SOURCE_CATEGORY_META[item.category];
  const level = effectiveLevel(item);
  const recommendedBy = item.priorityTitle ?? "AIWatch 信源清单";
  if (existing[0]) {
    if (!updateExisting) return "skipped";
    await db
      .update(sources)
      .set({
        name: item.name,
        handle: `@${item.handle}`,
        url: item.homeUrl,
        platform: "x",
        sourceType: meta.sourceType,
        level,
        connectorType: "rss",
        connectorRef: item.xmlUrl,
        categories: [item.category],
        recommendedBy,
        recommendReason: item.reason,
        fetchFrequency: tierFetchFrequency(level),
        enabled: true,
        archivedAt: null,
        healthStatus: "healthy",
        failureCount: 0,
        lastError: null,
        nextFetchAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(sources.id, existing[0].id));
    return "updated";
  }

  await db.insert(sources).values({
    id: newId("src"),
    platform: "x",
    name: item.name,
    handle: `@${item.handle}`,
    url: item.homeUrl,
    sourceType: meta.sourceType,
    level,
    connectorType: "rss",
    connectorRef: item.xmlUrl,
    categories: [item.category],
    brandTag: null,
    recommendedBy,
    recommendReason: item.reason,
    onboardedAt: new Date(),
    fetchFrequency: tierFetchFrequency(level),
    nextFetchAt: new Date(),
  });
  return "created";
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) usage();
  const dryRun = process.argv.includes("--dry-run");
  const updateExisting = process.argv.includes("--update-existing");
  const replaceActive = process.argv.includes("--replace");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 0;

  const text = await Bun.file(file).text();
  const candidates = parseCandidates(text)
    .map(classify)
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined);
  const counts = { created: 0, updated: 0, skipped: 0 };

  if (replaceActive) {
    if (dryRun) {
      const activeCount = (await activeSourceIds()).length;
      // eslint-disable-next-line no-console -- script output
      console.log(`[dry-run] would archive active sources: ${activeCount}`);
    } else {
      const archived = await archiveActiveSources();
      // eslint-disable-next-line no-console -- script output
      console.log(`[replace] archived active sources: ${archived}`);
    }
  }

  for (const item of candidates) {
    if (dryRun) {
      // eslint-disable-next-line no-console -- script output
      console.log(`[dry-run] ${item.priority ?? "-"}\t${item.handle}\t${effectiveLevel(item)}\t${AI_SOURCE_CATEGORY_LABEL[item.category]}\t${item.xmlUrl}`);
      continue;
    }
    const result = await upsertCandidate(item, updateExisting || replaceActive);
    counts[result] += 1;
    // eslint-disable-next-line no-console -- script output
    console.log(`[${result}] ${item.priority ?? "-"}\t${item.handle}\t${effectiveLevel(item)}\t${AI_SOURCE_CATEGORY_LABEL[item.category]}`);
  }

  // eslint-disable-next-line no-console -- script output
  console.log(`[xgo-import] parsed=${candidates.length} created=${counts.created} updated=${counts.updated} skipped=${counts.skipped}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console -- script output
    console.error("[xgo-import] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (openedDb) {
      const { pool } = await import("@/db/client");
      await pool.end();
    }
  });
