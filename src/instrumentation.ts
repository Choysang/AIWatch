// Next.js instrumentation hook (E1). Runs once when the server process boots. We use it
// only to fail-fast on a misconfigured production environment before the app serves any
// request. Dynamic-import the validator and guard on the nodejs runtime so the Edge bundle
// never pulls node:* dependencies.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnv } = await import("@/config/env");
  validateEnv();
}
