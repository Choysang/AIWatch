// POST /api/_admin/routing — set or reset a model-routing override (v0.5 C1). Login + admin
// role required; validates task/provider against the known sets; upserts (or deletes on
// reset) the override and writes an audit row. The worker picks up the change on its next
// refresh cron. The folder is %5Fadmin so it serves at the literal /api/_admin path.

import { z, ZodError } from "zod";
import { getSession, isAdminRole } from "@/app/_lib/session";
import { jsonError } from "@/app/api/public/_runtime";
import { recordAudit } from "@/db/audit";
import { db } from "@/db/client";
import { deleteRoutingOverride, upsertRoutingOverride } from "@/db/queries/routing-overrides";
import { LLM_TASKS, PROVIDERS } from "@/llm/routing";

export const dynamic = "force-dynamic";

const KNOWN_TASKS = LLM_TASKS as readonly string[];
const KNOWN_PROVIDERS = PROVIDERS as readonly string[];

const bodySchema = z.object({
  task: z.string(),
  reset: z.boolean().optional(),
  provider: z.string().optional(),
  model: z.string().min(1).max(120).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (!userId) return jsonError(401, "unauthorized");
  if (!isAdminRole(role)) return jsonError(403, "forbidden");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(body);
  } catch (err) {
    return jsonError(400, err instanceof ZodError ? "invalid_body" : "invalid_body");
  }
  if (!KNOWN_TASKS.includes(parsed.task)) return jsonError(400, "invalid_task");

  if (parsed.reset) {
    await deleteRoutingOverride(parsed.task);
    await recordAudit(db, {
      action: "routing.reset",
      actorId: userId,
      targetType: "llm_routing",
      targetId: parsed.task,
      after: { task: parsed.task, reset: true },
      reason: "routing override reset",
    });
    return Response.json({ ok: true, task: parsed.task, reset: true }, { status: 200 });
  }

  const model = parsed.model?.trim();
  if (!parsed.provider || !model) return jsonError(400, "provider_model_required");
  if (!KNOWN_PROVIDERS.includes(parsed.provider)) return jsonError(400, "invalid_provider");

  await upsertRoutingOverride(parsed.task, parsed.provider, model, userId);
  await recordAudit(db, {
    action: "routing.set",
    actorId: userId,
    targetType: "llm_routing",
    targetId: parsed.task,
    after: { task: parsed.task, provider: parsed.provider, model },
    reason: "routing override set",
  });
  return Response.json({ ok: true, task: parsed.task, provider: parsed.provider, model }, { status: 200 });
}
