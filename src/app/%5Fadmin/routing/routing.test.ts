// Source-string structure assertions for the model-routing admin (v0.5 C1.2). The route's
// auth path can't be invoked directly in tests (getSession needs a request scope), and the
// persistence is covered by tests/integration/routing-overrides.test.ts — here we assert the
// admin gate, validation, audit, and UI wiring are present.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const dir = import.meta.dir;
const editorSrc = readFileSync(join(dir, "routing-editor.tsx"), "utf8");
const pageSrc = readFileSync(join(dir, "page.tsx"), "utf8");
const routeSrc = readFileSync(join(dir, "..", "..", "api", "%5Fadmin", "routing", "route.ts"), "utf8");
const i18nSrc = readFileSync(join(dir, "..", "..", "..", "i18n", "messages", "zh.ts"), "utf8");

describe("model routing admin", () => {
  test("editor saves + resets via the admin routing API and refreshes", () => {
    expect(editorSrc).toContain('"/api/_admin/routing"');
    expect(editorSrc).toContain("reset: true");
    expect(editorSrc).toContain("router.refresh()");
    expect(editorSrc).toContain("<select");
  });

  test("page gates on admin role and computes the effective routing", () => {
    expect(pageSrc).toContain("isAdminRole");
    expect(pageSrc).toContain("listRoutingOverrides");
    expect(pageSrc).toContain("llmRouting[task]");
    expect(pageSrc).toContain("providerConfigured");
    expect(pageSrc).toContain("<RoutingEditor");
  });

  test("API route gates on admin role, validates task/provider, and audits", () => {
    expect(routeSrc).toContain("isAdminRole");
    expect(routeSrc).toContain("KNOWN_TASKS.includes");
    expect(routeSrc).toContain("KNOWN_PROVIDERS.includes");
    expect(routeSrc).toContain("upsertRoutingOverride");
    expect(routeSrc).toContain("deleteRoutingOverride");
    expect(routeSrc).toContain("recordAudit");
  });

  test("i18n backs the routing admin", () => {
    expect(i18nSrc).toContain("routing: {");
    expect(i18nSrc).toContain('title: "模型路由"');
  });
});
