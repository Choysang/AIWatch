import { describe, expect, test } from "bun:test";
import { isBeforeSourceOnboarding } from "./onboarding-cutoff";

describe("isBeforeSourceOnboarding", () => {
  const source = { onboardedAt: new Date("2026-05-31T12:00:00Z") };

  test("skips posts published before the source was onboarded", () => {
    expect(
      isBeforeSourceOnboarding(source, {
        publishedAt: new Date("2026-05-31T11:59:59Z"),
      }),
    ).toBe(true);
  });

  test("keeps posts from onboarding time onward", () => {
    expect(
      isBeforeSourceOnboarding(source, {
        publishedAt: new Date("2026-05-31T12:00:00Z"),
      }),
    ).toBe(false);
  });

  test("keeps undated posts because the source cannot prove they are old", () => {
    expect(isBeforeSourceOnboarding(source, {})).toBe(false);
  });
});
