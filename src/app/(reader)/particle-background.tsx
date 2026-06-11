// Stardust particle field behind the reader homepage: drifting nodes, proximity links,
// a faint tech grid, and gentle mouse attraction. Pure <canvas> — zero deps, GPU-composited,
// pointer-events: none so it never intercepts clicks. Respects prefers-reduced-motion
// (draws a single static frame instead of animating) and pauses while the page is hidden.
// Client island; renders nothing on the server (the canvas is painted entirely in the browser).

"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

const PARTICLE_DENSITY = 0.00009; // particles per CSS px² (≈70 on a 1440×768 viewport)
const MAX_PARTICLES = 90;
const LINK_DIST = 130; // px within which two nodes are linked
const MOUSE_RADIUS = 180; // px of mouse influence
const GRID = 42; // background grid spacing in px
const DEFAULT_PARTICLE_LINK_RGB = "120 150 255";

interface VisibilityAwareFrameLoopOptions {
  step: () => void;
  isVisible: () => boolean;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frameId: number) => void;
}

export function createVisibilityAwareFrameLoop({
  step,
  isVisible,
  requestFrame,
  cancelFrame,
}: VisibilityAwareFrameLoopOptions): {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
} {
  let active = false;
  let frameId = 0;

  function cancelScheduledFrame(): void {
    if (frameId === 0) return;
    cancelFrame(frameId);
    frameId = 0;
  }

  function schedule(): void {
    if (!active || frameId !== 0 || !isVisible()) return;
    frameId = requestFrame(run);
  }

  function run(): void {
    frameId = 0;
    if (!active || !isVisible()) return;
    step();
    schedule();
  }

  return {
    start() {
      active = true;
      schedule();
    },
    pause() {
      cancelScheduledFrame();
    },
    resume() {
      schedule();
    },
    stop() {
      active = false;
      cancelScheduledFrame();
    },
  };
}

export function ParticleBackground(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    // Declared (not just narrowed) non-null types so the nested closures below keep them.
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    const mouse = { x: -9999, y: -9999 };

    function particleCanvasColor(name: string, fallback: string): string {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    }

    function particleLinkColor(alpha: number): string {
      const rgb = particleCanvasColor("--particle-link-rgb", DEFAULT_PARTICLE_LINK_RGB);
      return `rgb(${rgb} / ${alpha})`;
    }

    function seed(): void {
      const target = Math.min(MAX_PARTICLES, Math.round(width * height * PARTICLE_DENSITY));
      particles = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        r: Math.random() * 1.4 + 0.7,
      }));
    }

    function resize(): void {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function drawGrid(): void {
      ctx.strokeStyle = particleCanvasColor("--particle-grid-color", "rgba(255, 255, 255, 0.022)");
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x += GRID) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += GRID) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    function step(): void {
      ctx.clearRect(0, 0, width, height);
      drawGrid();

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MOUSE_RADIUS) {
          const pull = (1 - dist / MOUSE_RADIUS) * 0.04;
          p.x += dx * pull;
          p.y += dy * pull;
        }

        ctx.fillStyle = particleCanvasColor("--particle-dot-color", "rgba(190, 205, 255, 0.45)");
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          if (!a || !b) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK_DIST) {
            ctx.strokeStyle = particleLinkColor(0.12 * (1 - d / LINK_DIST));
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }

    function onMouseMove(e: MouseEvent): void {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }
    function onMouseLeave(): void {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    const frameLoop = createVisibilityAwareFrameLoop({
      step,
      isVisible: () => !document.hidden,
      requestFrame: window.requestAnimationFrame.bind(window),
      cancelFrame: window.cancelAnimationFrame.bind(window),
    });

    function onVisibilityChange(): void {
      if (document.hidden) {
        frameLoop.pause();
      } else {
        frameLoop.resume();
      }
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseout", onMouseLeave);

    if (reduced) {
      step(); // single static frame, no animation
    } else {
      document.addEventListener("visibilitychange", onVisibilityChange);
      frameLoop.start();
    }

    return () => {
      frameLoop.stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseout", onMouseLeave);
    };
  }, []);

  return (
    <div className="particle-field" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
