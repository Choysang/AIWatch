// POST /api/annotations — 点6 主理人标注（有用/没用/撤销）。owner/admin 专用；
// 普通读者继续走赞/星/踩。verdict=null 表示撤销。Zod 校验 + 审计行。

import { z } from "zod";
import { getSession, isAdminRole } from "@/app/_lib/session";
import { jsonError } from "@/app/api/public/_runtime";
import { recordAudit } from "@/db/audit";
import { db } from "@/db/client";
import {
  clearOwnerAnnotation,
  setOwnerAnnotation,
} from "@/db/queries/owner-annotations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  subjectType: z.enum(["event", "source"]),
  subjectId: z.string().min(1).max(64),
  verdict: z.enum(["useful", "not_useful"]).nullable(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role ?? "user";
  if (!userId) return jsonError(401, "unauthorized");
  if (!isAdminRole(role)) return jsonError(403, "forbidden");

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return jsonError(400, "invalid-body");
  }

  if (parsed.verdict === null) {
    await clearOwnerAnnotation(parsed.subjectType, parsed.subjectId);
  } else {
    await setOwnerAnnotation({
      subjectType: parsed.subjectType,
      subjectId: parsed.subjectId,
      verdict: parsed.verdict,
      note: parsed.note ?? null,
    });
  }
  await recordAudit(db, {
    action: "annotation.set",
    actorId: userId,
    targetType: parsed.subjectType,
    targetId: parsed.subjectId,
    before: null,
    after: { verdict: parsed.verdict },
    reason: parsed.note ?? "owner annotation",
  });

  return Response.json({ success: true, data: { verdict: parsed.verdict }, error: null });
}
