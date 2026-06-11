# SP4 设计 — 晋级评分体系重构（点 8）

状态：**待用户确认**（设计稿，未实现）。依赖 SP2 的 `content_type`（已完成）。分支 `feat/spend-guard-and-reader-polish`。

## 需求（点 8）
把评分拆成清晰分层：**relevance_gate / event_quality_score / confidence_score / selection_score / rank_score**，让“相关性、质量、可信度、入选、排序”各司其职、可解释、可调权重而无需重新推理（沿用确定性评分哲学：LLM 只产不可变输入，SQL/确定性代码算派生分）。

## 现状（scoring-v1）
- **$0 确定性 gate**（`core/gate.ts`）：标题/内容过滤。
- **base_score** = source·0.2 + aiRelevance·0.15 + impact·0.2 + novelty·0.1 + externalHeat·0.15 + userValue·0.1 + expertValue·0.1。质量与人气**混在一起**。
- **promotion_score** = base·0.55 + expert·0.20 + citation·0.15 + comment·0.10（A/S 用；B 用 base 或专家直推）。
- **rank_score**：时间带 + 对数饱和。
- **display_score**：按等级半衰期衰减。
- 晋级锦标赛：阈值 B75/A86/S94，配额 B20/日 A12/周 S5/月，窗口 1/7/30 天。

**问题**：质量与人气耦合在 base_score；没有独立的“可信度/证据强度”维度；relevance 只是一个加权项而非硬门槛；content_type 未参与。

## 重构映射（scoring-v2，建议）
| 新层 | 含义 | 由谁组成 | 对应现状 |
|---|---|---|---|
| **relevance_gate** | 硬门槛：是否 AI 相关且达最低线 | $0 gate ∧ `aiRelevance ≥ RELEVANCE_MIN` | 现 aiRelevance 仅是加权项 → 升级为硬门槛 |
| **event_quality_score** | 内容**内在质量**（与人气无关） | source + impact + novelty + audienceUsefulness + evidenceClarity | ≈ base_score 但**剔除 externalHeat/userValue 人气项** |
| **confidence_score** | 我们对“真实且重要”的**把握** | 证据清晰度 + 信源等级 + 多源印证(合并到该 event 的独立 post 数) + 专家背书 | **全新**（现无独立可信度） |
| **selection_score** | 晋级闸门输入 | f(quality, confidence, 评论/引用信号, content_type 调节) | ≈ promotion_score，但受 confidence 把关 |
| **rank_score** | 窗口内**展示排序** | selection_score + 新鲜度 + 人气(externalHeat) 时间带 | 保留现 rank_score，输入换成 selection_score |

## 设计决策（建议值，待锁定）

### A. relevance_gate（硬门槛）
- 低于门槛的 event **仍进“全部动态”**，但**永不进入精选/晋级**（selection 直接 0）。
- 建议 `RELEVANCE_MIN = 50`（config 可调，版本戳）。
- **开放点 A1**：门槛只看 aiRelevance，还是也要 `impact ≥ X`？建议 V2 只用 aiRelevance，保持单一闸门。

### B. event_quality_score（去人气）
- 重新归一化权重（去掉 externalHeat/userValue 后剩余项重新分配，和=1）。建议：source 0.25 / impact 0.30 / novelty 0.15 / audienceUsefulness 0.15 / evidenceClarity 0.15。
- **开放点 B1**：userValue（现 0.1）何去何从？建议并入 confidence（它本质是“被多少人认可”的可信度信号），不进 quality。

### C. confidence_score（全新）
- 组成（0-100，各项 0-100 后加权，和=1，建议）：evidenceClarity 0.35 / sourceLevel 0.25 / 多源印证 0.25 / expertValue 0.15。
- **多源印证**：该 event 关联的独立 post 数（event_posts），1 源=低，≥3 源=高（对数饱和）。这是“可信度”的核心新信号。
- **开放点 C1**：单源 + 低等级信源是否**硬上限** selection（如 confidence<40 → 最高只能到 B）？建议**是**（防单条小道消息冲 S）。

### D. selection_score（晋级输入）
- 建议：`selection = quality * (0.5 + 0.5*confidence/100)` 再叠加评论/引用增量，最后乘 **content_type 调节系数**。
  - content_type 调节（建议）：model_release ×1.05、product_release ×1.0、tech_share ×1.0、discussion ×0.9（讨论类更难进精选；可调）。
- 晋级锦标赛阈值/配额/窗口**沿用现值**，但闸门分从 promotion_score 换成 selection_score。专家直推仍是 B 的自动资格。
- **开放点 D1**：confidence 是**乘法**门控（上表）还是加权项？建议乘法（低可信度真正压制高质量噪声）。
- **开放点 D2**：content_type 系数是否纳入？建议纳入（点 8 重构的价值之一是让分类影响入选）。

### E. rank_score（排序）
- 保留时间带 + 对数饱和；输入由 base_score 换成 selection_score，人气(externalHeat)作为同带内的次级排序加成。基本沿用现 `rank-score.ts`。

### F. 迁移 / 版本 / 回填
- `scoringConfig.version` → `scoring-v2`；新增 `qualityWeights / confidenceWeights / relevanceMin / contentTypeSelectionMultiplier`。
- **migration 0014**：`event_scores` 加 `event_quality_score / confidence_score / selection_score`（append-only）；`events` 去规范化 `selection_score`（晋级/排序读它）。保留 `base_score/promotion_score` 列一段时间（v1→v2 过渡，recompute 后可弃）。
- 使用 `recompute-scores-v2` 对候选 event 重算五层并回填，幂等、版本戳。
- 晋级 job 使用 `check-promotion-v2` 读取 selection_score；v1 promotion DB job 可在测试迁移后移除。

## 测试
- 各纯函数单测：relevanceGate 边界；quality 权重和=1 且去人气；confidence 多源印证对数；selection 乘法门控 + content_type 系数；低 confidence 上限封顶；scoring-v2 SQL↔TS 平价（沿用现有平价测试套路）。
- 集成：recompute-v2 回填；晋级锦标赛在 v2 下的入选集合；专家直推仍有效。

## 实现顺序（建议）
1. config scoring-v2 + 五个纯函数模块 + 单测（纯逻辑，零迁移，可独立提交）。
2. migration 0014 + 落库（createEventFromPost 写五层）。
3. recompute-v2 job + 晋级 job 切换 selection_score。
4. admin/卡片可解释展示（selected_breakdown 增加五层明细）。

> 这是五个子项目里**架构改动最大**的一项。建议分两段提交：纯函数+config（4.1）与 迁移+落库+recompute+晋级切换（4.2）。
