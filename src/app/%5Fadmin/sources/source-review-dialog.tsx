"use client";

import { useRef } from "react";
import { PLATFORM_LABEL, PLATFORMS, SOURCE_PROFILE_LABEL, SOURCE_PROFILES } from "@/sources/source-form";

export interface SourceRecommendationReviewItem {
  id: string;
  name: string;
  platform: string;
  sourceProfile: string;
  handle: string;
  url: string;
  recommendedBy: string;
  recommendReason: string;
  contact: string;
  createdAt: string;
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="admin-field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

export function SourceReviewDialog(props: { items: SourceRecommendationReviewItem[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const count = props.items.length;

  return (
    <>
      <button className="admin-action" type="button" onClick={() => dialogRef.current?.showModal()}>
        {count > 0 ? `审核推荐 (${count})` : "审核推荐"}
      </button>
      <dialog className="admin-dialog admin-source-review-dialog" ref={dialogRef}>
        <div className="admin-dialog-head">
          <h2>审核推荐信源</h2>
          <button
            aria-label="关闭"
            className="admin-dialog-close"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </div>
        {count === 0 ? (
          <div className="admin-dialog-empty">暂无待审核推荐。</div>
        ) : (
          <div className="admin-review-list">
            {props.items.map((item) => (
              <section className="admin-review-card" key={item.id}>
                <div className="admin-review-meta">
                  <strong>{item.createdAt}</strong>
                  {item.contact ? <span>提交人：{item.contact}</span> : <span>匿名提交</span>}
                </div>
                <form method="post" action={`/api/_admin/contributions/${item.id}`} className="admin-review-form">
                  <input name="action" type="hidden" value="approve_apply" />
                  <div className="admin-form-grid">
                    <Field label="名称">
                      <input name="name" required maxLength={200} defaultValue={item.name} />
                    </Field>
                    <Field label="账号标识">
                      <input name="handle" maxLength={120} defaultValue={item.handle} />
                    </Field>
                  </div>
                  <div className="admin-form-grid">
                    <Field label="平台">
                      <select name="platform" defaultValue={item.platform}>
                        {PLATFORMS.map((value) => (
                          <option key={value} value={value}>
                            {PLATFORM_LABEL[value]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="信源定位">
                      <select name="sourceProfile" defaultValue={item.sourceProfile}>
                        {SOURCE_PROFILES.map((value) => (
                          <option key={value} value={value}>
                            {SOURCE_PROFILE_LABEL[value]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="主页 URL">
                    <input name="url" type="url" required defaultValue={item.url} />
                  </Field>
                  <Field label="推荐人">
                    <input name="recommendedBy" maxLength={120} defaultValue={item.recommendedBy} />
                  </Field>
                  <Field label="推荐理由">
                    <textarea name="recommendReason" rows={3} maxLength={1000} defaultValue={item.recommendReason} />
                  </Field>
                  <div className="admin-dialog-actions">
                    <button type="submit" className="admin-action">
                      通过并接入
                    </button>
                  </div>
                </form>
                <form method="post" action={`/api/_admin/contributions/${item.id}`} className="admin-review-reject">
                  <input name="action" type="hidden" value="reject" />
                  <button type="submit" className="admin-danger-link">
                    拒绝推荐
                  </button>
                </form>
              </section>
            ))}
          </div>
        )}
      </dialog>
    </>
  );
}
