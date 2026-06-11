// Connectivity audit for the curated source pool. Fetches every feed in
// data/sources/curated_ai_sources.json, parses it, and writes a CSV report with
// HTTP status, parseability, item count and the latest item date — so dead or
// stale channels are caught before they silently rot in the crawler.
//
// rsshub-routed sources need a reachable RSSHub instance:
//   RSSHUB_BASE_URL=http://localhost:1200 bun run scripts/audit-source-health.ts
//   bun run scripts/audit-source-health.ts --rsshub=https://rsshub.example.com
// Without a base URL those rows are marked "skipped(no-rsshub)" instead of failing.
//
// Usage:
//   bun run scripts/audit-source-health.ts [--rsshub=URL] [--concurrency=N] [--timeout=MS]

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFeed } from "@/connectors/rss";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = join(ROOT, "data", "sources", "curated_ai_sources.json");
const REPORT_PATH = join(ROOT, "data", "sources", "source_connectivity_report.csv");

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_CONCURRENCY = 6;

interface CuratedSource {
  name: string;
  platform: string;
  connectorType: string;
  connectorRef: string;
  url: string;
}

interface AuditRow {
  name: string;
  platform: string;
  connectorType: string;
  target: string;
  status: string;
  contentType: string;
  parseable: "yes" | "no" | "-";
  itemCount: number | "-";
  latestItemDate: string;
  verdict: "ok" | "stale" | "empty" | "dead" | "skipped";
  error: string;
}

function argValue(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function resolveTarget(source: CuratedSource, rsshubBase: string | undefined): string | null {
  if (source.connectorType === "rsshub") {
    if (/^https?:\/\//i.test(source.connectorRef)) return source.connectorRef;
    if (!rsshubBase) return null;
    return `${rsshubBase.replace(/\/+$/, "")}/${source.connectorRef.replace(/^\/+/, "")}`;
  }
  return source.connectorRef;
}

const STALE_DAYS = 45;

async function auditOne(
  source: CuratedSource,
  rsshubBase: string | undefined,
  timeoutMs: number,
): Promise<AuditRow> {
  const base: Omit<AuditRow, "status" | "contentType" | "parseable" | "itemCount" | "latestItemDate" | "verdict" | "error"> =
    {
      name: source.name,
      platform: source.platform,
      connectorType: source.connectorType,
      target: resolveTarget(source, rsshubBase) ?? source.connectorRef,
    };
  const target = resolveTarget(source, rsshubBase);
  if (!target) {
    return {
      ...base,
      status: "-",
      contentType: "-",
      parseable: "-",
      itemCount: "-",
      latestItemDate: "-",
      verdict: "skipped",
      error: "no-rsshub-base",
    };
  }
  try {
    const res = await fetch(target, {
      headers: { "user-agent": "AIWatch/0.1 source-health-audit" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    const contentType = res.headers.get("content-type") ?? "-";
    if (!res.ok) {
      return {
        ...base,
        status: String(res.status),
        contentType,
        parseable: "no",
        itemCount: "-",
        latestItemDate: "-",
        verdict: "dead",
        error: `http ${res.status}`,
      };
    }
    const body = await res.text();
    let items: ReturnType<typeof parseFeed> = [];
    try {
      items = parseFeed(body);
    } catch (error) {
      return {
        ...base,
        status: String(res.status),
        contentType,
        parseable: "no",
        itemCount: "-",
        latestItemDate: "-",
        verdict: "dead",
        error: `parse: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const latest = items
      .map((item) => item.publishedAt?.getTime() ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);
    const latestIso = latest ? new Date(latest).toISOString().slice(0, 10) : "-";
    const verdict: AuditRow["verdict"] =
      items.length === 0
        ? "empty"
        : latest && Date.now() - latest > STALE_DAYS * 24 * 3600 * 1000
          ? "stale"
          : "ok";
    return {
      ...base,
      status: String(res.status),
      contentType,
      parseable: "yes",
      itemCount: items.length,
      latestItemDate: latestIso,
      verdict,
      error: "",
    };
  } catch (error) {
    return {
      ...base,
      status: "-",
      contentType: "-",
      parseable: "no",
      itemCount: "-",
      latestItemDate: "-",
      verdict: "dead",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main(): Promise<void> {
  const rsshubBase =
    argValue("--rsshub=") ?? process.env.RSSHUB_BASE_URL ?? process.env.RSSHUB_URL ?? undefined;
  const timeoutMs = Number(argValue("--timeout=") ?? DEFAULT_TIMEOUT_MS);
  const concurrency = Number(argValue("--concurrency=") ?? DEFAULT_CONCURRENCY);

  const curated = JSON.parse(await readFile(DATA_PATH, "utf8")) as CuratedSource[];
  const queue = [...curated];
  const rows: AuditRow[] = [];

  async function workerLoop(): Promise<void> {
    for (;;) {
      const source = queue.shift();
      if (!source) return;
      const row = await auditOne(source, rsshubBase, timeoutMs);
      rows.push(row);
      // eslint-disable-next-line no-console -- script output
      console.log(
        `[${row.verdict}] ${row.name}\t${row.status}\titems=${row.itemCount}\tlatest=${row.latestItemDate}\t${row.error}`,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, workerLoop));

  rows.sort((a, b) => a.name.localeCompare(b.name));
  const header =
    "name,platform,connector_type,target,status_code,content_type,parseable,item_count,last_item_date,verdict,error";
  const csv = [
    header,
    ...rows.map((row) =>
      [
        row.name,
        row.platform,
        row.connectorType,
        row.target,
        row.status,
        row.contentType,
        row.parseable,
        row.itemCount,
        row.latestItemDate,
        row.verdict,
        row.error,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");
  await writeFile(REPORT_PATH, `${csv}\n`, "utf8");

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.verdict] = (acc[row.verdict] ?? 0) + 1;
    return acc;
  }, {});
  // eslint-disable-next-line no-console -- script output
  console.log(`[source-health] total=${rows.length}`, counts, `→ ${REPORT_PATH}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console -- script output
  console.error("[source-health] failed:", error);
  process.exit(1);
});
