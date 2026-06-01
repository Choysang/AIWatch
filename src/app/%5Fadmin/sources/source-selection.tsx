"use client";

import { useEffect, useState } from "react";

function sourceCheckboxes(formId: string): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[name="sourceIds"][form="${formId}"]`),
  );
}

const selectionChangeEvent = "source-selection-change";

export function SourceSelectAll(props: { formId: string }) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const sync = () => {
      const boxes = sourceCheckboxes(props.formId);
      setChecked(boxes.length > 0 && boxes.every((box) => box.checked));
    };
    sync();
    document.addEventListener("change", sync);
    document.addEventListener(selectionChangeEvent, sync);
    return () => {
      document.removeEventListener("change", sync);
      document.removeEventListener(selectionChangeEvent, sync);
    };
  }, [props.formId]);

  return (
    <input
      aria-label="选择全部信源"
      checked={checked}
      form={props.formId}
      type="checkbox"
      onChange={(event) => {
        for (const box of sourceCheckboxes(props.formId)) {
          box.checked = event.currentTarget.checked;
        }
        setChecked(event.currentTarget.checked);
        document.dispatchEvent(new Event(selectionChangeEvent));
      }}
    />
  );
}

export function SourceBulkDeleteButton(props: { formId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => {
      setCount(sourceCheckboxes(props.formId).filter((box) => box.checked).length);
    };
    sync();
    document.addEventListener("change", sync);
    document.addEventListener(selectionChangeEvent, sync);
    return () => {
      document.removeEventListener("change", sync);
      document.removeEventListener(selectionChangeEvent, sync);
    };
  }, [props.formId]);

  return (
    <button className="admin-danger-action" disabled={count === 0} form={props.formId} type="submit">
      {count > 0 ? `删除选中 (${count})` : "删除选中"}
    </button>
  );
}

export function SourceTableResize(props: { tableId: string }) {
  useEffect(() => {
    const table = document.getElementById(props.tableId);
    if (!table) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const colHandle = target.closest<HTMLElement>(".admin-col-resizer");
      if (colHandle?.dataset.colIndex) {
        event.preventDefault();
        const index = colHandle.dataset.colIndex;
        const col = table.querySelector<HTMLElement>(`col[data-col-index="${index}"]`);
        const header = colHandle.closest<HTMLElement>("th");
        if (!col || !header) return;
        const startX = event.clientX;
        const startWidth = header.getBoundingClientRect().width;

        const onMove = (moveEvent: PointerEvent) => {
          const colCount = table.querySelectorAll("col[data-col-index]").length;
          const minWidth = 48;
          const maxWidth = Math.max(minWidth, table.getBoundingClientRect().width - minWidth * (colCount - 1));
          const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.round(startWidth + moveEvent.clientX - startX)));
          col.style.width = `${nextWidth}px`;
        };
        const onUp = () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        return;
      }

      const rowHandle = target.closest<HTMLElement>(".admin-row-resizer");
      if (rowHandle) {
        event.preventDefault();
        const row = rowHandle.closest<HTMLElement>("tr");
        if (!row) return;
        const startY = event.clientY;
        const startHeight = row.getBoundingClientRect().height;

        const onMove = (moveEvent: PointerEvent) => {
          const nextHeight = Math.max(52, Math.round(startHeight + moveEvent.clientY - startY));
          row.style.height = `${nextHeight}px`;
        };
        const onUp = () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      }
    };

    table.addEventListener("pointerdown", onPointerDown);
    return () => table.removeEventListener("pointerdown", onPointerDown);
  }, [props.tableId]);

  return null;
}
