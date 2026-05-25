import { describe, expect, test } from "bun:test";
import { fingerprint } from "./fingerprint";

describe("fingerprint", () => {
  test("is deterministic for the same inputs and salt", () => {
    const a = fingerprint("1.2.3.4", "Mozilla/5.0", "salt");
    const b = fingerprint("1.2.3.4", "Mozilla/5.0", "salt");
    expect(a).toBe(b);
  });

  test("differs when IP, UA, or salt change", () => {
    const base = fingerprint("1.2.3.4", "UA", "salt");
    expect(fingerprint("9.9.9.9", "UA", "salt")).not.toBe(base);
    expect(fingerprint("1.2.3.4", "OtherUA", "salt")).not.toBe(base);
    expect(fingerprint("1.2.3.4", "UA", "othersalt")).not.toBe(base);
  });

  test("returns a 32-char hex digest (truncated sha256, no raw PII)", () => {
    const fp = fingerprint("1.2.3.4", "UA", "salt");
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
    expect(fp).not.toContain("1.2.3.4");
  });
});
