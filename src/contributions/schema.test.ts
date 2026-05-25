import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { parseSubmission } from "./schema";

describe("parseSubmission — source_recommendation", () => {
  test("accepts a valid recommendation and derives target=source, no targetId required", () => {
    const r = parseSubmission({
      kind: "source_recommendation",
      reason: "great firsthand model news",
      proposedChange: { url: "https://openai.com/blog", name: "OpenAI Blog", categories: ["模型"] },
    });
    expect(r.kind).toBe("source_recommendation");
    expect(r.targetType).toBe("source");
    expect(r.targetId).toBeUndefined();
    expect(r.proposedChange).toEqual({
      url: "https://openai.com/blog",
      name: "OpenAI Blog",
      categories: ["模型"],
    });
  });

  test("rejects a non-URL", () => {
    expect(() =>
      parseSubmission({ kind: "source_recommendation", proposedChange: { url: "not-a-url" } }),
    ).toThrow(ZodError);
  });
});

describe("parseSubmission — target-bound kinds require targetId", () => {
  const needsTarget = [
    ["source_metadata_fix", { field: "name", value: "New Name" }],
    ["tag_category_suggestion", { tags: ["agent"] }],
    ["merge_association_suggestion", { otherEventId: "evt_x" }],
    ["correction_report", { problem: "wrong main source" }],
  ] as const;

  for (const [kind, change] of needsTarget) {
    test(`${kind} throws without targetId`, () => {
      expect(() => parseSubmission({ kind, proposedChange: change })).toThrow(ZodError);
    });

    test(`${kind} passes with targetId`, () => {
      const r = parseSubmission({ kind, targetId: "evt_123", proposedChange: change });
      expect(r.kind).toBe(kind);
      expect(r.targetId).toBe("evt_123");
    });
  }
});

describe("parseSubmission — documentation needs no targetId", () => {
  test("accepts a documentation note", () => {
    const r = parseSubmission({ kind: "documentation", proposedChange: { note: "fix the README" } });
    expect(r.targetType).toBe("documentation");
    expect(r.targetId).toBeUndefined();
  });
});

describe("parseSubmission — per-kind change validation", () => {
  test("tag_category_suggestion requires tags or category", () => {
    expect(() =>
      parseSubmission({ kind: "tag_category_suggestion", targetId: "evt_1", proposedChange: {} }),
    ).toThrow(ZodError);
  });

  test("correction_report requires a problem", () => {
    expect(() =>
      parseSubmission({ kind: "correction_report", targetId: "evt_1", proposedChange: { suggestion: "x" } }),
    ).toThrow(ZodError);
  });

  test("unknown kind is rejected", () => {
    expect(() => parseSubmission({ kind: "spam", proposedChange: {} })).toThrow(ZodError);
  });

  test("captures optional contact and reason", () => {
    const r = parseSubmission({
      kind: "documentation",
      reason: "typo",
      contact: "me@example.com",
      proposedChange: { note: "n" },
    });
    expect(r.reason).toBe("typo");
    expect(r.contact).toBe("me@example.com");
  });
});
