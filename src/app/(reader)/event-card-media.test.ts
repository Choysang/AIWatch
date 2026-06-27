import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const eventCardSource = readFileSync(join(import.meta.dir, "event-card.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("event card media", () => {
  test("wraps card images in a proxied large-image link", () => {
    expect(eventCardSource).toContain("proxiedImageUrl");
    expect(eventCardSource).toContain('className="card-media-link"');
    expect(eventCardSource).toContain("target=\"_blank\"");
    expect(eventCardSource).toContain("cardThumbProxy");
  });

  test("does not force card images into a fixed-height black thumbnail box", () => {
    const cardMediaBlock = cssSource.slice(
      cssSource.indexOf(".card-media {"),
      cssSource.indexOf("/* 精选 star", cssSource.indexOf(".card-media {")),
    );
    expect(cardMediaBlock).toContain("justify-content: center;");
    expect(cardMediaBlock).toContain("max-width: 100%;");
    expect(cardMediaBlock).not.toMatch(/\n\s*width:\s*100%;/);
    expect(cardMediaBlock).not.toContain("background: #000");
    expect(cssSource).not.toContain(".reader-home .card-media,\n.reader-home .card-media img,\n.reader-home .card-media video {\n  max-height: 150px;");
  });
});
