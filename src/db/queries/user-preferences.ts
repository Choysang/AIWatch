// 登录读者偏好（借鉴 bestblogs）：默认信源筛选。一用户一行，upsert 覆盖。
// 行不存在 = 从未定制；default_source_ids 为空数组 = 显式清空（首页不应用筛选）。

import { eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { userPreferences } from "@/db/schema";

export interface UserPreference {
  defaultSourceIds: string[];
}

export async function getUserPreference(
  userId: string,
  db: DB = defaultDb,
): Promise<UserPreference | null> {
  const rows = await db
    .select({ defaultSourceIds: userPreferences.defaultSourceIds })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function setUserPreference(
  userId: string,
  pref: UserPreference,
  db: DB = defaultDb,
): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, defaultSourceIds: pref.defaultSourceIds })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { defaultSourceIds: pref.defaultSourceIds, updatedAt: new Date() },
    });
}

/** 删除整行 = 回到"从未定制"状态。 */
export async function clearUserPreference(userId: string, db: DB = defaultDb): Promise<void> {
  await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
}
