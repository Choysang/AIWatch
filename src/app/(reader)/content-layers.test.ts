// Source-string structure assertions for the content-layer switcher (v0.5 B1, merged 原文/全文),
// following the reader-component convention (assert structure as text, not React render).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const dir = import.meta.dir;
const componentSrc = readFileSync(join(dir, "content-layers.tsx"), "utf8");
const detailSrc = readFileSync(join(dir, "events", "[id]", "page.tsx"), "utf8");
const i18nSrc = readFileSync(join(dir, "..", "..", "i18n", "messages", "zh.ts"), "utf8");
const cssSrc = readFileSync(join(dir, "..", "globals.css"), "utf8");

describe("content-layer switcher (merged 原文/全文)", () => {
  test("offers AI / 原文 layers, defaulting to AI", () => {
    expect(componentSrc).toContain('useState<Layer>("ai")');
    expect(componentSrc).toContain("m.ai");
    expect(componentSrc).toContain("m.original");
    // 全文 is no longer a separate tab — it is merged into 原文.
    expect(componentSrc).not.toContain("m.fulltext");
  });

  test("原文 fetches the full article on demand and does not re-fetch once requested", () => {
    expect(componentSrc).toContain("`/api/events/${eventId}/fulltext`");
    expect(componentSrc).toContain('if (!canFetchFull || fullStatus !== "idle") return;');
    expect(componentSrc).toContain('setFullStatus("loading")');
  });

  test("prefers full text but never downgrades a longer original (length guard)", () => {
    expect(componentSrc).toContain("fullText.length >= originalText.length");
    expect(componentSrc).toContain("const body = upgraded ? fullText : originalText;");
  });

  test("when full text is unavailable it silently shows 原文 (no notice when body exists)", () => {
    // body present -> render the text only; the loading/unavailable notes are body===null branches.
    expect(componentSrc).toContain("body !== null ? (");
    expect(componentSrc).toContain('<div className="original-text-body">{body}</div>');
  });

  test("shows the 原文 tab when there is ingested text OR a fetchable source", () => {
    expect(componentSrc).toContain("const hasBodyTab = originalText !== null || canFetchFull;");
  });

  test("detail page renders ContentLayers with server-converted original text + canFetchFull", () => {
    expect(detailSrc).toContain("<ContentLayers");
    expect(detailSrc).toContain("htmlToReadableText(event.rawContent)");
    expect(detailSrc).toContain("canFetchFull={Boolean(event.url)}");
    expect(detailSrc).toContain('from "../../content-layers"');
  });

  test("renders structured rich blocks (B1.5) when extraction yields them, else plain text", () => {
    expect(componentSrc).toContain('import { RichContent } from "./rich-content"');
    expect(componentSrc).toContain("blocks?: RichBlock[]");
    expect(componentSrc).toContain("const richReady = upgraded && blocks.length > 0;");
    expect(componentSrc).toContain("<RichContent blocks={blocks} />");
    // rich rendering wins, with the plain-text body as the fallback branch.
    expect(componentSrc).toContain("richReady ? (");
    expect(cssSrc).toContain(".rich-table {");
    expect(cssSrc).toContain(".rich-code {");
  });

  test("i18n + CSS back the switcher", () => {
    expect(i18nSrc).toContain("layer: {");
    expect(i18nSrc).toContain('original: "原文"');
    expect(i18nSrc).toContain("loading:");
    expect(i18nSrc).not.toContain("fullFallback:");
    expect(i18nSrc).not.toContain('fulltext: "全文"');
    expect(cssSrc).toContain(".content-layer-tab.is-active {");
  });
});
