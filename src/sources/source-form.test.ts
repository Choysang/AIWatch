import { describe, expect, test } from "bun:test";
import { sourceFormSchema, sourceMetaFromProfile, toCreateSourceInput } from "./source-form";

describe("sourceMetaFromProfile", () => {
  test("allows explicit source type and level to override the profile default", () => {
    expect(
      sourceMetaFromProfile({
        sourceProfile: "official",
        sourceType: "community",
        level: "L3",
      }),
    ).toEqual({ sourceType: "community", level: "L3" });
  });

  test("uses the profile default when no explicit override is provided", () => {
    expect(sourceMetaFromProfile({ sourceProfile: "official" })).toEqual({
      sourceType: "official",
      level: "L1",
    });
  });

  test("treats blank source type and level form values as profile defaults", () => {
    const parsed = sourceFormSchema.parse({
      name: "Vertical AI",
      platform: "blog",
      sourceProfile: "technical_share",
      sourceType: "",
      level: "",
      url: "https://example.com",
    });

    expect(toCreateSourceInput(parsed)).toMatchObject({
      sourceType: "expert",
      level: "L3",
    });
  });
});
