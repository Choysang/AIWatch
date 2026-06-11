# 架构总览

AIWatch 是一个严选型 AI 信息雷达：少量高质量信源 → 结构化 AI 判定 → 确定性评分晋级 → 中文优先的阅读端。

```
┌─ worker（Bun + graphile-worker）────────────────────────────────┐
│ 连接器层  rss / rsshub(X等硬源) / github / hn / manual          │
│   ↓ 归一化 RawPost（统一 id/title/url/content/media/time）      │
│ 门控层    onboarding 截止、确定性预过滤、simhash 去重           │
│   ↓                                                            │
│ 判定层    light_judge（分类+五维分+一句话中文摘要，全量）        │
│           deep_extract（详摘+核心观点+标签，仅 score≥80 的 T2） │
│   ↓ LLM 产物 = 不可变输入；spend_guard 控费                    │
│ 折叠层    fold_key(主体|内容形态) → 同一事件多帖聚合            │
│ 评分层    确定性 SQL/TS 合成 promotion_score → B/A/S 晋级       │
│ 报告层    日报/周报/月报 cron 确定性生成                        │
└────────────────────────────────────────────────────────────────┘
            │ PostgreSQL 16（Drizzle，迁移即真相）
┌─ web（Next.js App Router，SSR 为主）───────────────────────────┐
│ 阅读端：精选默认流 + 时间线 + 搜索/筛选 + 事件详情 + 互动/评论  │
│ 管理端：信源健康 / 晋级 / 报告 / 贡献审核 / 反馈                │
│ 公共接口：REST(items/daily) + RSS + MCP/Skill                  │
└────────────────────────────────────────────────────────────────┘
```

## 关键设计决策

1. **LLM 只产不可变输入**：所有派生分数由确定性代码与 SQL 计算；调权重 = 重跑，而非重新推理。判定带 prompt 版本号可追溯。
2. **信源是数据，连接器是代码**：信源唯一正典 `data/sources/curated_ai_sources.json`，导入幂等、池外软归档；连接器按平台实现 `SourceConnector { fetch }`。
3. **错误隔离**：单源失败走熔断（failure_count/health_status），不影响全局抓取；RSSHub 失败只降覆盖率不降可用性。
4. **安全**：safeFetch SSRF 守卫（仅对自托管 RSSHub 主机精确放行）、提示词注入隔离（untrusted_source 标签）、CSP、登录态与读者 rid 分离。
5. **轻部署**：三容器（web/worker+db+rsshub），GHCR 拉取式发布，无额外中间件依赖；3.5GB 单机可跑。

## 性能要点

- SSR + 列表 30 条/页（URL `limit` 步进加载更多，上限 150），骨架屏过渡。
- 搜索走 pg_trgm + 预拼 search_text 列；feed 查询单趟带回热点候选。
- 报告页 unstable_cache 5 分钟；图片懒加载；评论按需展开。

更多：部署细节见 `docs/deployment.md` 与 `docs/deploy-ghcr.md`；信源策略见 `docs/source_policy.md`。
