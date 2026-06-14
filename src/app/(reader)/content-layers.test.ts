// Source-string structure assertions for the content-layer switcher (v0.5 B1.2), following
// the reader-component convention (assert structure as text, not React render).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const dir = import.meta.dir;
const componentSrc = readFileSync(join(dir, "content-layers.tsx"), "utf8");
const detailSrc = readFileSync(join(dir, "events", "[id]", "page.tsx"), "utf8");
const i18nSrc = readFileSync(join(dir, "..", "..", "i18n", "messages", "zh.ts"), "utf8");
const cssSrc = readFileSync(join(dir, "..", "globals.css"), "utf8");

describe("content-layer switcher", () => {
  test("offers AI / 原文 / 全文 layers, defaulting to AI", () => {
    expect(componentSrc).toContain('useState<Layer>("ai")');
    expect(componentSrc).toContain("m.ai");
    expect(componentSrc).toContain("m.original");
    expect(componentSrc).toContain("m.fulltext");
  });

  test("fetches 全文 on demand and does not re-fetch once requested", () => {
    expect(componentSrc).toContain("`/api/events/${eventId}/fulltext`");
    expect(componentSrc).toContain('if (fullStatus !== "idle") return;');
    expect(componentSrc).toContain('setFullStatus("loading")');
  });

  test("only renders the 原文 tab when original text exists", () => {
    expect(componentSrc).toContain("...(originalText ?");
  });

  test("detail page renders ContentLayers with server-converted original text", () => {
    expect(detailSrc).toContain("<ContentLayers");
    expect(detailSrc).toContain("htmlToReadableText(event.rawContent)");
    expect(detailSrc).toContain('from "../../content-layers"');
  });

  test("i18n + CSS back the switcher", () => {
    expect(i18nSrc).toContain("layer: {");
    expect(i18nSrc).toContain('fulltext: "全文"');
    expect(cssSrc).toContain(".content-layer-tab.is-active {");
  });
});
