// Stage 7 output view: MCP server. Exposes the same brief JSON the REST API / RSS serve as
// MCP tools so agents (Cursor, Claude Desktop) can query AIWatch directly. Read-only; wraps
// listBriefItems. Run with: bun run mcp/index.ts  (stdio transport).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listBriefItems, type BriefItem } from "@/db/queries/brief";
import { EVENT_CATEGORIES, windowStart, type EventCategory } from "@/public/query";
import { EVENT_TIERS, type EventTier } from "@/pipeline/judge-schema";

const CATEGORY_SET: ReadonlySet<string> = new Set(EVENT_CATEGORIES);
const TIER_SET: ReadonlySet<string> = new Set(EVENT_TIERS);

function resolveSince(raw: string | undefined, now: Date): Date | null {
  if (!raw || raw === "all") return null;
  if (raw === "today" || raw === "week" || raw === "month") return windowStart(raw, now);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** In-memory substring filter (brief result is capped at 100 rows, so this is cheap). */
function applyQuery(items: BriefItem[], query: string | undefined): BriefItem[] {
  if (!query?.trim()) return items;
  const q = query.trim().toLowerCase();
  return items.filter((it) =>
    [it.title, it.one_line_summary, it.detailed_summary, it.category, ...it.tags]
      .some((part) => typeof part === "string" && part.toLowerCase().includes(q)),
  );
}

function asText(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

const server = new McpServer({ name: "aiwatch", version: "1.0.0" });

// The SDK's registerTool generic infers handler arg types from the Zod shape; under our strict
// tsconfig that inference overflows (TS2589). This wrapper supplies the arg type explicitly and
// erases the offending inference. Runtime Zod validation by the SDK is unaffected.
type ToolConfig = { title?: string; description?: string; inputSchema?: Record<string, z.ZodTypeAny> };
type ToolResult = { content: { type: "text"; text: string }[] };
function registerTool<A>(name: string, config: ToolConfig, handler: (args: A) => Promise<ToolResult>): void {
  (server.registerTool as unknown as (n: string, c: ToolConfig, h: (a: A) => Promise<ToolResult>) => void)(
    name,
    config,
    handler,
  );
}

interface SearchArgs {
  category?: string;
  tier?: string;
  since?: string;
  query?: string;
  sort?: string;
  take?: number;
}
interface LatestArgs {
  take?: number;
}

registerTool<SearchArgs>(
  "search_brief",
  {
    title: "Search AIWatch brief",
    description:
      "Search the curated AI-Dev intelligence brief. Filter by category, tier (T1 list / T2 featured), " +
      "time window, free-text query, and sort. Returns fact-only summaries (no verbatim quotes).",
    // Plain string/number shapes (not z.enum) keep the SDK's generic inference from blowing the
    // TS recursion limit (TS2589). Allowed values are validated against the sets below in-handler.
    inputSchema: {
      category: z.string().optional()
        .describe(
          "Domain: large_model / framework_tools / product_app / industry_biz / research_paper / safety_align.",
        ),
      tier: z.string().optional().describe("T1 = list-only, T2 = featured (detailed)."),
      since: z.string().optional().describe("today | week | month | all | ISO date."),
      query: z.string().optional().describe("Free-text substring over title/summaries/tags."),
      sort: z.string().optional().describe("default = tier/source/recency; time = pure recency."),
      take: z.number().int().min(1).max(100).optional().describe("Max items (1-100, default 50)."),
    },
  },
  async ({ category, tier, since, query, sort, take }) => {
    const now = new Date();
    const items = await listBriefItems({
      category: category && CATEGORY_SET.has(category) ? (category as EventCategory) : undefined,
      tier: tier && TIER_SET.has(tier) ? (tier as EventTier) : undefined,
      since: resolveSince(since, now),
      sort: sort === "time" ? "time" : "default",
      take: take ?? 50,
    });
    return asText(applyQuery(items, query));
  },
);

registerTool<LatestArgs>(
  "get_latest",
  {
    title: "Get latest AIWatch items",
    description: "Return the most recent brief items in pure reverse-chronological order.",
    inputSchema: {
      take: z.number().int().min(1).max(100).optional().describe("Max items (1-100, default 20)."),
    },
  },
  async ({ take }) => {
    const items = await listBriefItems({ sort: "time", take: take ?? 20 });
    return asText(items);
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio transport keeps the process alive; log to stderr so we never corrupt the stdout JSON-RPC stream.
  process.stderr.write("[aiwatch-mcp] ready on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[aiwatch-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
