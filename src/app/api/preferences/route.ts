// POST /api/preferences — 登录读者保存/清除默认信源筛选（bestblogs 式定制）。
// defaultSourceIds: string[] 保存当前选择（空数组 = 显式"不筛选"）；null 删除定制。
// 任意登录用户可用（非 owner 专属）；未登录 401。

import { z } from "zod";
import { getSession } from "@/app/_lib/session";
import { jsonError } from "@/app/api/public/_runtime";
import {
  clearUserPreference,
  setUserPreference,
} from "@/db/queries/user-preferences";
import { MAX_SOURCE_IDS } from "@/public/query";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  defaultSourceIds: z
    .array(z.string().regex(/^[a-z0-9_-]{1,64}$/i))
    .max(MAX_SOURCE_IDS)
    .nullable(),
});

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return jsonError(401, "unauthorized");

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return jsonError(400, "invalid-body");
  }

  if (parsed.defaultSourceIds === null) {
    await clearUserPreference(userId);
  } else {
    await setUserPreference(userId, { defaultSourceIds: [...new Set(parsed.defaultSourceIds)] });
  }
  return Response.json({
    success: true,
    data: { defaultSourceIds: parsed.defaultSourceIds },
    error: null,
  });
}
