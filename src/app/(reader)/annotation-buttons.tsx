"use client";

// 点6 切片B/E：主理人标注岛（有用/没用）。仅 owner/admin 渲染（SSR 端判定），
// 乐观切换，再点同一判决撤销。失败回滚并提示。事件卡片与信源行共用
// （subjectType 默认 event；信源行传 source）。

import { useState } from "react";

export type OwnerVerdict = "useful" | "not_useful";

export function AnnotationButtons({
  subjectId,
  subjectType = "event",
  initialVerdict,
}: {
  subjectId: string;
  subjectType?: "event" | "source";
  initialVerdict: OwnerVerdict | null;
}) {
  const [verdict, setVerdict] = useState<OwnerVerdict | null>(initialVerdict);
  const [error, setError] = useState(false);

  const toggle = async (next: OwnerVerdict) => {
    const target = verdict === next ? null : next;
    const prev = verdict;
    setVerdict(target);
    setError(false);
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectType, subjectId, verdict: target }),
      });
      if (!res.ok) throw new Error(`annotation failed: ${res.status}`);
    } catch {
      setVerdict(prev);
      setError(true);
    }
  };

  return (
    <span className="annotation-buttons" title="主理人标注：训练打分偏好">
      <button
        type="button"
        className={`annotation-btn ${verdict === "useful" ? "is-active" : ""}`}
        aria-pressed={verdict === "useful"}
        onClick={() => toggle("useful")}
      >
        ✓ 有用
      </button>
      <button
        type="button"
        className={`annotation-btn is-negative ${verdict === "not_useful" ? "is-active" : ""}`}
        aria-pressed={verdict === "not_useful"}
        onClick={() => toggle("not_useful")}
      >
        ✗ 没用
      </button>
      {error && <span className="annotation-error">未保存</span>}
    </span>
  );
}
