// Thin logging seam (L1). A single choke point for log level + a future PII-scrub hook,
// so pipeline/library code never calls console.* directly. Entry points that own process
// lifecycle (worker/index.ts, scripts/*) may still use console for boot/fatal output.
//
// Keep this runtime-agnostic (no node:* imports) so it is safe in the Next server runtime,
// the Edge runtime, and the Bun worker alike.

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (configured && configured in LEVELS) return LEVELS[configured as Level];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

function emit(level: Level, args: readonly unknown[]): void {
  if (LEVELS[level] < threshold()) return;
  // Single emit() seam: future redaction/scrubbing of `args` lands here only.
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(...args);
}

export const log = {
  debug: (...args: unknown[]): void => emit("debug", args),
  info: (...args: unknown[]): void => emit("info", args),
  warn: (...args: unknown[]): void => emit("warn", args),
  error: (...args: unknown[]): void => emit("error", args),
};
