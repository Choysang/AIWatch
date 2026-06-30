"use client";

// 点6 切片B/E：主理人标注岛（有用/没用）。仅 owner/admin 渲染（SSR 端判定），
// 乐观切换，再点同一判决撤销。失败回滚并提示。事件卡片与信源行共用
// （subjectType 默认 event；信源行传 source）。

import { useRef, useState } from "react";

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
  const rootRef = useRef<HTMLSpanElement>(null);
  const [verdict, setVerdict] = useState<OwnerVerdict | null>(initialVerdict);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = async (next: OwnerVerdict) => {
    if (saving) return;
    const target = verdict === next ? null : next;
    const prev = verdict;
    setVerdict(target);
    setError(false);
    setSaving(true);
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectType, subjectId, verdict: target }),
      });
      if (!res.ok) throw new Error(`annotation failed: ${res.status}`);
      if (subjectType === "event" && target) {
        rootRef.current?.closest(".card:not(.card-detail)")?.classList.add("is-owner-reviewed");
      }
    } catch {
      setVerdict(prev);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <span ref={rootRef} className="annotation-buttons" title="主理人标注：训练打分偏好">
      <button
        type="button"
        className={`annotation-btn ${verdict === "useful" ? "is-active" : ""}`}
        aria-pressed={verdict === "useful"}
        title="主理人标记有用：进入偏好画像并提升类似内容"
        data-tooltip="进入偏好画像并提升类似内容"
        disabled={saving}
        onClick={() => toggle("useful")}
      >
        ✓ 有用
      </button>
      <button
        type="button"
        className={`annotation-btn is-negative ${verdict === "not_useful" ? "is-active" : ""}`}
        aria-pressed={verdict === "not_useful"}
        title="主理人标记没用：进入偏好画像并压低类似内容"
        data-tooltip="进入偏好画像并压低类似内容"
        disabled={saving}
        onClick={() => toggle("not_useful")}
      >
        ✗ 没用
      </button>
      {error && <span className="annotation-error">未保存</span>}
    </span>
  );
}
