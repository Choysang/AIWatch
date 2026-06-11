import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const meDir = import.meta.dir;
const pageContent = readFileSync(join(meDir, "page-content.tsx"), "utf8");

function readMeFile(relativePath: string): string {
  return readFileSync(join(meDir, relativePath), "utf8");
}

describe("my interactions pages", () => {
  test("has separate routes for likes, stars, and comments", () => {
    expect(existsSync(join(meDir, "likes", "page.tsx"))).toBe(true);
    expect(existsSync(join(meDir, "stars", "page.tsx"))).toBe(true);
    expect(existsSync(join(meDir, "comments", "page.tsx"))).toBe(true);
    expect(existsSync(join(meDir, "page.tsx"))).toBe(true);
  });

  test("renders account-scoped pages with login prompt and subpage nav", () => {
    expect(pageContent).toContain("getSession");
    expect(pageContent).toContain("SubpageNav");
    expect(pageContent).toContain("login?next=");
    expect(pageContent).toContain("messages.me");
    expect(pageContent).toContain("m.loginRequired");
    expect(pageContent).toContain("m.heading");
    expect(pageContent).toContain("m.tabs[tab]");
  });

  test("reaction pages load cards and hydrate viewer reactions", () => {
    expect(pageContent).toContain("listMyReactionEvents");
    expect(pageContent).toContain("getViewerReactions");
    expect(pageContent).toContain("EventCard");
    expect(readMeFile(join("likes", "page.tsx"))).toContain('kind="like"');
    expect(readMeFile(join("stars", "page.tsx"))).toContain('kind="star"');
  });

  test("comments page loads only the current user's comments", () => {
    expect(pageContent).toContain("listMyComments");
    expect(readMeFile(join("comments", "page.tsx"))).toContain("MyCommentsPage");
  });
});
