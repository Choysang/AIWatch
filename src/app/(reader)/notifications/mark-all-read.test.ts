import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const markAllReadSource = readFileSync(join(import.meta.dir, "mark-all-read.tsx"), "utf8");

describe("mark all notifications read", () => {
  test("marks unread notifications without forcing a second page refresh", () => {
    expect(markAllReadSource).toContain('fetch("/api/notifications/read"');
    expect(markAllReadSource).not.toContain("router.refresh");
    expect(markAllReadSource).not.toContain("useRouter");
  });
});
