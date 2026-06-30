// 点6 切片A：主理人标注存取。判决行为不可变输入（可改判/撤销，不直接动分数）；
// 偏好聚合与打分修正在 scoring 层推导（见 docs/annotation-preference-design.md）。

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { newId } from "@/core/ids";
import { db as defaultDb, type DB } from "@/db/client";
import { events, ownerAnnotations, sources } from "@/db/schema";

export type AnnotationSubjectType = "event" | "source";
export type AnnotationVerdict = "useful" | "not_useful";

/** Upsert one verdict (改判覆盖旧行，updated_at 刷新). */
export async function setOwnerAnnotation(
  input: {
    subjectType: AnnotationSubjectType;
    subjectId: string;
    verdict: AnnotationVerdict;
    note?: string | null;
  },
  db: DB = defaultDb,
): Promise<void> {
  await db
    .insert(ownerAnnotations)
    .values({
      id: newId("ann"),
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      verdict: input.verdict,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [ownerAnnotations.subjectType, ownerAnnotations.subjectId],
      set: { verdict: input.verdict, note: input.note ?? null, updatedAt: new Date() },
    });
}

/** 撤销标注（再次点击同一判决时调用）。 */
export async function clearOwnerAnnotation(
  subjectType: AnnotationSubjectType,
  subjectId: string,
  db: DB = defaultDb,
): Promise<void> {
  await db
    .delete(ownerAnnotations)
    .where(
      and(eq(ownerAnnotations.subjectType, subjectType), eq(ownerAnnotations.subjectId, subjectId)),
    );
}

/** Verdicts for a batch of subjects (SSR hydration for the cards). */
export async function getOwnerAnnotations(
  subjectType: AnnotationSubjectType,
  subjectIds: string[],
  db: DB = defaultDb,
): Promise<Map<string, AnnotationVerdict>> {
  if (subjectIds.length === 0) return new Map();
  const rows = await db
    .select({ subjectId: ownerAnnotations.subjectId, verdict: ownerAnnotations.verdict })
    .from(ownerAnnotations)
    .where(
      and(
        eq(ownerAnnotations.subjectType, subjectType),
        inArray(ownerAnnotations.subjectId, subjectIds),
      ),
    );
  return new Map(rows.map((r) => [r.subjectId, r.verdict]));
}

export interface OwnerAnnotationListRow {
  id: string;
  subjectType: AnnotationSubjectType;
  subjectId: string;
  verdict: AnnotationVerdict;
  note: string | null;
  updatedAt: Date;
  /** Event title or source name, resolved by subject type ("已删除" subjects -> null). */
  subjectLabel: string | null;
  sourceId: string | null;
  category: string | null;
  contentType: string | null;
  tags: string[];
}

/** 点6 切片D：最近标注列表（标注台），事件取标题、信源取名称。 */
export async function listRecentOwnerAnnotations(
  limit = 50,
  db: DB = defaultDb,
): Promise<OwnerAnnotationListRow[]> {
  const rows = await db
    .select({
      id: ownerAnnotations.id,
      subjectType: ownerAnnotations.subjectType,
      subjectId: ownerAnnotations.subjectId,
      verdict: ownerAnnotations.verdict,
      note: ownerAnnotations.note,
      updatedAt: ownerAnnotations.updatedAt,
      subjectLabel: sql<string | null>`coalesce(${events.title}, ${sources.name})`,
      sourceId: events.mainSourceId,
      category: events.category,
      contentType: events.contentType,
      tags: events.tags,
    })
    .from(ownerAnnotations)
    .leftJoin(
      events,
      and(eq(ownerAnnotations.subjectType, "event"), eq(events.id, ownerAnnotations.subjectId)),
    )
    .leftJoin(
      sources,
      and(eq(ownerAnnotations.subjectType, "source"), eq(sources.id, ownerAnnotations.subjectId)),
    )
    .orderBy(desc(ownerAnnotations.updatedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, tags: row.tags ?? [] }));
}
