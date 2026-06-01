"use client";

import { useRef } from "react";
import { PLATFORM_LABEL, PLATFORMS, SOURCE_PROFILE_LABEL, SOURCE_PROFILES } from "@/sources/source-form";

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="admin-field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function SelectField<T extends readonly string[]>(props: {
  name: string;
  label: string;
  values: T;
  defaultValue: T[number];
  labels?: Record<string, string>;
}) {
  return (
    <Field label={props.label}>
      <select name={props.name} defaultValue={props.defaultValue}>
        {props.values.map((value) => (
          <option key={value} value={value}>
            {props.labels?.[String(value)] ?? value}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function SourceAddDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button className="admin-action" type="button" onClick={() => dialogRef.current?.showModal()}>
        添加信源
      </button>
      <dialog className="admin-dialog" ref={dialogRef}>
        <div className="admin-dialog-head">
          <h2>添加信源</h2>
          <button
            aria-label="关闭"
            className="admin-dialog-close"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </div>
        <form method="post" action="/api/_admin/sources" className="admin-form admin-dialog-form">
          <div className="admin-form-grid">
            <Field label="名称">
              <input name="name" required maxLength={200} placeholder="OpenAI" />
            </Field>
            <Field label="账号标识">
              <input name="handle" maxLength={120} placeholder="@OpenAI" />
            </Field>
          </div>
          <div className="admin-form-grid">
            <SelectField name="platform" label="平台" values={PLATFORMS} defaultValue="x" labels={PLATFORM_LABEL} />
            <SelectField
              name="sourceProfile"
              label="信源定位"
              values={SOURCE_PROFILES}
              defaultValue="core_people"
              labels={SOURCE_PROFILE_LABEL}
            />
          </div>
          <Field label="主页 URL">
            <input name="url" type="url" placeholder="https://x.com/OpenAI" />
          </Field>
          <Field label="推荐人">
            <input name="recommendedBy" maxLength={120} />
          </Field>
          <Field label="推荐理由">
            <textarea name="recommendReason" rows={3} maxLength={1000} />
          </Field>
          <div className="admin-dialog-actions">
            <button type="button" className="admin-secondary-action" onClick={() => dialogRef.current?.close()}>
              取消
            </button>
            <button type="submit" className="admin-action">
              创建信源
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
