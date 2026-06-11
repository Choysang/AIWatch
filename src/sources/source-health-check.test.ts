import { describe, expect, test } from "bun:test";
import type { ConnectorType, RawPost, SourceConnector } from "@/connectors/types";
import type { ManagedSourceRow } from "@/db/queries/sources";
import { checkManagedSourceFetchHealth } from "./source-health-check";

function source(overrides: Partial<ManagedSourceRow> = {}): ManagedSourceRow {
  return {
    id: "src_tencent_hunyuan",
    name: "Tencent Hy",
    platform: "x",
    handle: "@TencentHunyuan",
    url: null,
    level: "L1",
    sourceType: "official",
    connectorType: "rsshub",
    connectorRef: "/twitter/user/TencentHunyuan",
    categories: [],
    brandTag: "腾讯混元",
    recommendedBy: "Choysun",
    recommendReason: "腾讯混元模型官方",
    onboardedAt: new Date("2026-06-05T00:00:00Z"),
    enabled: true,
    healthStatus: "healthy",
    lastError: null,
    ...overrides,
  };
}

function connector(fetch: SourceConnector["fetch"]): SourceConnector {
  return {
    type: "rsshub",
    fetch,
  };
}

describe("checkManagedSourceFetchHealth", () => {
  test("marks an enabled source unavailable when the actual connector fetch fails", async () => {
    const writes: Array<{ id: string; error: string }> = [];

    const checked = await checkManagedSourceFetchHealth(source(), {
      getConnector: (_type: ConnectorType) =>
        connector(async () => {
          throw new Error("[rsshub] RSSHUB_BASE_URL not configured");
        }),
      markHealthCheckFailure: async (id, error) => {
        writes.push({ id, error });
      },
      markHealthCheckSuccess: async () => {
        throw new Error("success writer should not run");
      },
    });

    expect(checked.healthStatus).toBe("degraded");
    expect(checked.lastError).toContain("RSSHUB_BASE_URL");
    expect(writes).toEqual([
      {
        id: "src_tencent_hunyuan",
        error: "[rsshub] RSSHUB_BASE_URL not configured",
      },
    ]);
  });

  test("clears stale health errors after a successful connector fetch", async () => {
    const successes: string[] = [];
    const posts: RawPost[] = [];

    const checked = await checkManagedSourceFetchHealth(
      source({ healthStatus: "degraded", lastError: "old error" }),
      {
        getConnector: (_type: ConnectorType) => connector(async () => posts),
        markHealthCheckSuccess: async (id) => {
          successes.push(id);
        },
        markHealthCheckFailure: async () => {
          throw new Error("failure writer should not run");
        },
      },
    );

    expect(checked.healthStatus).toBe("healthy");
    expect(checked.lastError).toBeNull();
    expect(successes).toEqual(["src_tencent_hunyuan"]);
  });

  test("does not fetch disabled sources from the admin status check", async () => {
    const checked = await checkManagedSourceFetchHealth(source({ enabled: false, lastError: "off" }), {
      getConnector: () => {
        throw new Error("disabled sources should not be fetched");
      },
      markHealthCheckFailure: async () => {
        throw new Error("disabled sources should not be written");
      },
      markHealthCheckSuccess: async () => {
        throw new Error("disabled sources should not be written");
      },
    });

    expect(checked.healthStatus).toBe("healthy");
    expect(checked.lastError).toBe("off");
  });
});
