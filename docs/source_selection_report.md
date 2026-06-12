# 信源严选报告（2026-06-12）

## 候选池与结论

| 项 | 数量 |
|---|---|
| 审计候选总数（临时原始池 + 项目已有信源，去重后） | 967 |
| 判定 drop/C（AI 密度不足、营销/商业噪声、依赖高风险桥接） | 748 |
| 判定 drop/out_of_scope（播客/YouTube 等音视频链路，本轮不做） | 177 |
| 判定 keep S 级 | 12 |
| 判定 keep A 级 | 19 |
| 判定 keep B 级（暂时观察，不入池） | 11 |
| 连通性复核后剔除（渠道死亡/解析失败） | 3（LangChain Blog、LlamaIndex Blog、Qdrant Blog） |
| URL 修正 | 2（Google DeepMind Blog、Qdrant Blog → 后者复测仍失败，剔除） |
| **最终核心池（`curated_ai_sources.json`）** | **30** |

明细见 `data/sources/source_audit_report.csv`（每行含五维评分、扣分项、去留理由）；
连通性见 `data/sources/source_connectivity_report.csv`（`bun run sources:audit` 可随时重测）。

## 筛选标准

1. 只收强 AI 相关：大模型 / Agent / AI 编程 / AI 产品 / AI 基础设施 / 论文 / 开源 / 行业动态 / 商业化 / 工具链。
2. 评分维度：relevance、quality、freshness、stability、uniqueness、ai_density（0-10），另设营销/浅内容/泛技术/商业评论四类扣分与第三方依赖风险分，合成 final_score。
3. 一票否决：标题党、课程导流、依赖高风险第三方桥接（公众号 RSS 全部因此出局）、无法访问或解析失败。
4. 宁缺毋滥：B 级仅观察不入池；后续凭实际精选贡献率（后台"来源健康"+ 复核建议）晋降级。

## 最终核心池（30）

**X / RSSHub 路由（24）**：OpenAI、OpenAI Developers、ChatGPTapp、Anthropic、Claude、Sam Altman、Google AI、Google DeepMind、Andrej Karpathy、xAI、DeepSeek、Qwen、月之暗面、智谱AI、MiniMax、Tencent Hunyuan、Xiaomi MiMo、Hugging Face、LangChain、LlamaIndex、Jina AI、OpenRouter、LMSYS Arena、李继刚。
**直连 RSS/博客（6，已全部连通验证）**：OpenAI Blog、Google DeepMind Blog、Hugging Face Blog、Latent Space、Last Week in AI、量子位。

## 已知风险与验证安排

- 24 个 X 路由依赖自托管 RSSHub 的 `/twitter/user/*`，需要实例配置 `TWITTER_AUTH_TOKEN`；生产部署后必须用 `bun run sources:audit`（容器内，RSSHUB_BASE_URL=http://rsshub:1200）做权威连通性验证，失败则按"信源修复预案"处理（见 deployment 文档）。
- Last Week in AI 为周更，latest 落后数日属正常节奏，不算 stale。
- 公众号源（中文生态重要补充）整体搁置：唯一可行通道是第三方/自托管 RSS 桥接，稳定性与合规风险高；若启用，方案是自托管桥接并按本报告同一标准重新申报，记录在 `docs/future_ideas.md`。

## 优胜劣汰机制（常态化）

- `bun run sources:import:curated --archive-non-curated`：以 JSON 为准做幂等同步，池外源软归档（不删数据）。
- 后台"来源健康"展示连续失败/复核建议（60 天无精选贡献、30 天精选率偏低）。
- 新源入口：读者提报 → 后台审核 → 进 JSON → 重新导入。
