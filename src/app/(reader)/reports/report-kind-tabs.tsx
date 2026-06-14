// 日/周/月报顶部的粒度切换器（读者「速览」筛选）。放在每个报告页 masthead 之下，
// 任意报告页都能一键切到另一粒度。此前 日/周/月 只藏在主侧栏的展开子项里——移动端
// 侧栏更难触达，用户因此「只看到日报」。纯展示 server component：active 由所在页的
// kind 决定，三个链接为静态路由，无客户端状态。

import Link from "next/link";
import { messages } from "@/i18n";
import type { ReportKind } from "@/reports/types";

const TABS: { kind: ReportKind; href: string }[] = [
  { kind: "daily", href: "/reports" },
  { kind: "weekly", href: "/reports/weekly" },
  { kind: "monthly", href: "/reports/monthly" },
];

export function ReportKindTabs({ active }: { active: ReportKind }) {
  const m = messages.report;
  return (
    <nav className="report-kind-tabs" aria-label="速览周期">
      {TABS.map((tab) => (
        <Link
          key={tab.kind}
          href={tab.href}
          className={`report-kind-tab ${tab.kind === active ? "is-active" : ""}`}
          aria-current={tab.kind === active ? "page" : undefined}
        >
          {m.kind[tab.kind]}
        </Link>
      ))}
    </nav>
  );
}
