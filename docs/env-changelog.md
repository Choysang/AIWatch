# Env Changelog

每次发版若需要改服务器 `/srv/.env`（或部署 checkout 的 `.env`），在这里记一行。
**推 tag 前过一眼这张表**——历史上多次"忘改 env → 功能静默失效"（LLM 网关、X 源、邮件告警）。

部署前先跑：`IMAGE_TAG=<tag> bash scripts/pre-deploy-check.sh`

| 版本 | 变更 | 必需 | 破坏性 | 备注 |
|------|------|------|--------|------|
| v0.5.x | 默认 LLM 路由统一为 `openai_compatible` + `deepseek-ai/deepseek-v4-flash` | 是 | 否 | 生产需同时设置 `OPENAI_COMPATIBLE_API_KEY` 与 `OPENAI_COMPATIBLE_BASE_URL`；`LLM_PROVIDER/LLM_MODEL` 可显式改回其他 keyed provider |
| v0.5.x | `OPENAI_COMPATIBLE_BASE_URL` → `https://newapi.ccspcservices.com/v1` | 是 | 否 | 旧网关 `119.29.65.250:4001` 曾因 FortiGate 自签证 TLS 报错 |
| v0.4.4 | 新增 `SOURCE_ALERT_EMAIL`（X 源失效邮件告警） | 否 | 否 | 需配 `RESEND_API_KEY` + `AUTH_EMAIL_FROM` 才生效 |
| v0.4.2 | 价目表新增 DeepSeek-V4-Flash 条目 | 是 | 否 | 镜像换模型必须同步 `pricing`，否则 spend_guard ledger 失明 |
| 0.x 生产初始化 | `CONTRIBUTION_SALT`、`READER_ID_SECRET`、`BETTER_AUTH_SECRET`、`DATABASE_SSL=disable`、`TRUSTED_PROXY_HOPS` | 是 | — | 一次性；内网 postgres 无 SSL 故 `DATABASE_SSL=disable` |

## 排错速记

- **X 路由全失败 / RSSHub 503**：`TWITTER_AUTH_TOKEN` 失效或未设 → 更新后重启 rsshub 容器。
- **LLM 全失败**：检查 `OPENAI_COMPATIBLE_BASE_URL` 与网关证书。
- **spend_guard 无记账**：价目表与当前镜像模型不一致。
