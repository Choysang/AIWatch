# 主理人标注与偏好学习设计（点6，2026-06-12）

## 问题

当前打分 = LLM 判定（不可变输入）+ SQL 确定性合成（base/rank/promotion score），
读者反馈（赞/星/踩）只反映群体行为。主理人对"什么资讯对我有用"的**个人意图**没有
输入通道；信源去留同样只凭纸面评分。需要一个低摩擦的人工标注形式，把主理人偏好
变成确定性的打分修正与信源晋降级依据。

## 原则（沿用项目哲学）

1. **标注是不可变输入**：标注行只追加/更新，不直接改分数。
2. **SQL/纯函数推导**：偏好画像与分数修正由确定性聚合计算，可重算、可解释。
3. **低摩擦**：标注在信息流卡片上一键完成（有用 / 没用），不打断阅读。

## 数据模型

```sql
CREATE TABLE owner_annotations (
  id          text PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('event','source')),
  subject_id  text NOT NULL,
  verdict     text NOT NULL CHECK (verdict IN ('useful','not_useful')),
  note        text,                          -- 可选一句话理由（喂给后续 prompt 调优）
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id)          -- 单主理人：一对象一标注，可改判
);
```

仅 owner/admin 角色可写（RBAC 复用 Slice 4 体系）。

## 偏好画像（确定性聚合）

事件标注按维度聚合出**亲和度** affinity ∈ [-1, +1]：

```
affinity(dim, key) = (useful - not_useful) / (useful + not_useful)，n < 3 时记 0（样本不足）
```

维度：`source`（主信源）、`source_content_type`（同一信源下的内容类型交叉）、`category`
（公共分类）、`content_type`、`tag`（取事件 tags）。
聚合落在物化视图或 recompute 时实时算（30 源 × 数百事件，实时算足够快）。

## 打分接入（rank-score v5）

`computeRankScore` 增加一项 `ownerBoost`：

```
ownerBoost = directBoost + affinityBoost
directBoost   = +12（该事件被标 useful）/ -20（被标 not_useful）   # 直接判决最强
affinityBoost = clamp(
  -6..+6,
  6 × mean(affinity(source), affinity(source_content_type), affinity(category), affinity(content_type), affinity(best_tag))
)
```

- 有界、可解释、进 breakdown（卡片调试可见）。
- 配置进 `rankScoreConfig`（当前 rank-v5），SQL 批量任务保持 TS↔SQL parity 测试。
- not_useful 直接压分 20 分 ≈ 把误判资讯挤出首屏，等效"这类内容少来"。
- `source_content_type` 专门处理"这个信源整体不错，但它的某类内容长期无用"：不必直接停用整个信源，
  先限制该信源的重复低价值类型。

## 信源标注与晋降级

1. 信源页（/_admin/sources）每行加 有用/没用 标注（subject_type='source'）。
2. 来源健康面板新增两列：**主理人判决**（直接标注）与**事件亲和度**
   （该源事件标注聚合）。两者结合给晋降级建议：
   - affinity ≤ -0.5 且 n ≥ 5 → 建议降级/出池
   - affinity ≥ +0.5 且 n ≥ 5（观察源）→ 建议入池
3. B 级观察源复评（docs/source_selection_report.md）下一轮直接引用该数据。

## UI

- **卡片**（仅 owner 登录可见）：card-bottom 右侧两个小按钮 `有用` / `没用`，
  乐观切换，再点取消。不影响普通读者界面。
- **标注台** `/_admin/annotations`：列出最近标注 + 各维度 affinity 表，
  作为"意图画像"自检页。
- 入口零新页面成本：信息流本身就是标注队列（最新内容自然流过）。

## 实施切片

| 切片 | 内容 | 状态 |
|---|---|---|
| A | migration + owner_annotations 查询层 + POST/GET API（owner 鉴权）| ✅ 完成（9989d86）|
| B | 卡片标注按钮（owner-only client island）| ✅ 完成（9989d86）|
| C | affinity 聚合纯函数 + rank-v5 ownerBoost + recompute SQL parity | ✅ 完成（2026-07-01，新增 source×content_type 交叉亲和度）|
| D | /_admin/annotations 意图画像页 + 来源健康两列 | ✅ 完成（2026-06-12，标注台 + 信源表「主理人标注」列）|
| E | 信源行标注 + 晋降级建议规则 | ✅ 完成（2026-06-12，sourceAffinitySuggestion ±0.5/n≥5）|

切片 A→C 即闭环（标注→打分变化）；D/E 是可视化与信源侧延伸。
