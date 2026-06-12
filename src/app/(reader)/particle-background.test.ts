import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createVisibilityAwareFrameLoop } from "./particle-background";

const source = readFileSync(join(import.meta.dir, "particle-background.tsx"), "utf8");
const cssSource = readFileSync(join(import.meta.dir, "..", "globals.css"), "utf8");

describe("createVisibilityAwareFrameLoop", () => {
  test("waits to schedule the first frame until the page becomes visible", () => {
    let visible = false;
    let frameCount = 0;

    const loop = createVisibilityAwareFrameLoop({
      step: () => {},
      isVisible: () => visible,
      requestFrame: () => {
        frameCount += 1;
        return frameCount;
      },
      cancelFrame: () => {},
    });

    loop.start();
    expect(frameCount).toBe(0);

    visible = true;
    loop.resume();
    expect(frameCount).toBe(1);
  });

  test("does not run or keep scheduling frames while hidden", () => {
    let visible = true;
    let steps = 0;
    let nextFrameId = 1;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    const cancelledFrames: number[] = [];

    const loop = createVisibilityAwareFrameLoop({
      step: () => {
        steps += 1;
      },
      isVisible: () => visible,
      requestFrame: (callback) => {
        const id = nextFrameId;
        nextFrameId += 1;
        frameCallbacks.set(id, callback);
        return id;
      },
      cancelFrame: (id) => {
        cancelledFrames.push(id);
      },
    });

    loop.start();
    expect(frameCallbacks.has(1)).toBe(true);

    visible = false;
    loop.pause();
    expect(cancelledFrames).toEqual([1]);

    frameCallbacks.get(1)?.(0);
    expect(steps).toBe(0);

    visible = true;
    loop.resume();
    expect(frameCallbacks.has(2)).toBe(true);

    frameCallbacks.get(2)?.(16);
    expect(steps).toBe(1);
    expect(frameCallbacks.has(3)).toBe(true);

    loop.stop();
    expect(cancelledFrames).toEqual([1, 3]);
  });
});

describe("particle background theme colors", () => {
  test("uses a light page backing instead of the dark particle field in day mode", () => {
    expect(cssSource).toContain('html[data-reader-theme="light"] .particle-field');
    expect(cssSource).toContain("background:\n    radial-gradient");
    expect(cssSource).toContain("#f7f9fc");
  });

  test("reads particle drawing colors from CSS variables so day mode can use soft ink", () => {
    expect(source).toContain("particleCanvasColor");
    expect(source).toContain("getComputedStyle(document.documentElement)");
    expect(source).not.toContain('ctx.strokeStyle = "rgba(255, 255, 255, 0.022)"');
    expect(source).not.toContain('ctx.fillStyle = "rgba(190, 205, 255, 0.45)"');
  });
});
