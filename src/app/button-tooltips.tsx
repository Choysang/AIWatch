"use client";

import { useEffect } from "react";

const MAX_TOOLTIP_LENGTH = 40;

const DESCRIPTIVE_TOOLTIP_BY_LABEL: Record<string, string> = {
  搜索: "按关键词检索当前信息流",
  筛选: "展开时间、评分和信源筛选",
  最新: "按发布时间查看全部动态",
  精选: "只看编辑精选内容",
  推荐: "按你的主题板偏好过滤",
  "清除筛选": "恢复默认信息流",
  "应用筛选": "应用当前筛选条件",
  "清除全部": "清空面板里的筛选",
  "资讯速览": "打开右侧标题导航",
  "收起侧栏": "关闭右侧速览栏",
  收起: "关闭当前侧栏",
  点赞: "标记这条内容有帮助",
  深读: "收藏到我的深读列表",
  讨论: "展开这条动态的讨论",
  撤销: "撤回刚才的标记",
};

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buttonLabel(button: HTMLButtonElement): string {
  const explicit = normalizedText(button.getAttribute("data-tooltip") || "");
  if (explicit) return explicit.slice(0, MAX_TOOLTIP_LENGTH);

  const visibleText = normalizedText(button.textContent || "");
  const described = DESCRIPTIVE_TOOLTIP_BY_LABEL[visibleText];
  if (described) return described.slice(0, MAX_TOOLTIP_LENGTH);

  const aria = normalizedText(button.getAttribute("aria-label") || "");
  if (!aria) return "";
  const normalized = DESCRIPTIVE_TOOLTIP_BY_LABEL[aria] ?? aria;
  return normalized !== visibleText ? normalized.slice(0, MAX_TOOLTIP_LENGTH) : "";
}

export function ButtonTooltips() {
  useEffect(() => {
    function ensureTitle(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!(button instanceof HTMLButtonElement) || button.title) return;
      const label = buttonLabel(button);
      if (label) button.title = label;
    }

    document.addEventListener("pointerover", ensureTitle, true);
    document.addEventListener("focusin", ensureTitle, true);
    return () => {
      document.removeEventListener("pointerover", ensureTitle, true);
      document.removeEventListener("focusin", ensureTitle, true);
    };
  }, []);

  return null;
}
