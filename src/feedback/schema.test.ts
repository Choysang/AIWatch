import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { MAX_FEEDBACK_BODY, parseFeedbackSubmission } from "./schema";

describe("parseFeedbackSubmission", () => {
  test("accepts a body and trims it", () => {
    const out = parseFeedbackSubmission({ body: "  好用,但希望加暗色模式  " });
    expect(out.body).toBe("好用,但希望加暗色模式");
    expect(out.contact).toBeUndefined();
  });

  test("keeps a non-empty contact", () => {
    const out = parseFeedbackSubmission({ body: "x", contact: "me@example.com" });
    expect(out.contact).toBe("me@example.com");
  });

  test("normalizes a whitespace-only contact to undefined (column stays null)", () => {
    const out = parseFeedbackSubmission({ body: "x", contact: "   " });
    expect(out.contact).toBeUndefined();
  });

  test("rejects an empty / whitespace-only body", () => {
    expect(() => parseFeedbackSubmission({ body: "   " })).toThrow(ZodError);
    expect(() => parseFeedbackSubmission({ body: "" })).toThrow(ZodError);
    expect(() => parseFeedbackSubmission({})).toThrow(ZodError);
  });

  test("rejects an over-long body", () => {
    expect(() => parseFeedbackSubmission({ body: "a".repeat(MAX_FEEDBACK_BODY + 1) })).toThrow(ZodError);
  });
});
