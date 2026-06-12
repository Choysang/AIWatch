# 部署手册

完整的 GHCR 发布链路见 `docs/deploy-ghcr.md`；本文是操作摘要 + 信源运维。

## 本地一条命令

```bash
bun run dev:db        # 内嵌 PostgreSQL
bun run db:migrate && bun run sources:import:curated
bun run dev           # web
bun run worker        # 抓取/判定/报告
```

## 生产发布（拉取式，不在服务器构建）

1. 推 tag 触发镜像构建：`git tag v0.x.y && git push origin v0.x.y`（或在 GitHub Actions 手动 run release.yml）。
2. 服务器拉取更新：

```bash
ssh <server>
cd /opt/aiwatch
IMAGE_TAG=latest docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml run --rm web bun run db:migrate
docker compose -f docker-compose.prod.yml up -d
```

环境变量见 `.env.example`（生产另需 `TWITTER_AUTH_TOKEN` 供 RSSHub 的 X 路由使用）。
**常规发布绝不重置数据库**：迁移向前滚，信源导入只做 upsert + 软归档。

## 信源同步与连通性验证（每次信源池变更后）

```bash
# 容器内执行（worker 镜像带全部脚本）
docker compose -f docker-compose.prod.yml run --rm worker bun run sources:import:curated --archive-non-curated
docker compose -f docker-compose.prod.yml run --rm worker bun run sources:audit   # RSSHUB_BASE_URL 已指向 rsshub:1200
```

audit 输出每源 status/parseable/latest_item_date（CSV 在容器内 data/sources/）。判读：
- `dead` + http 4xx/5xx 的 X 路由 → 检查 rsshub 容器 `TWITTER_AUTH_TOKEN`；
- 单源持续失败 → 后台"来源健康"会累计 failure_count 并熔断，确认后从 JSON 移除再导入。

## 回填最近 7 天

新源首抓只收 `onboarded_at` 之后发布的内容。要回填一周：

```bash
docker compose -f docker-compose.prod.yml run --rm worker bun -e "
const { db } = await import('./src/db/client.ts');
const { sql } = await import('drizzle-orm');
await db.execute(sql\`update sources set onboarded_at = now() - interval '7 days', next_fetch_at = now() where archived_at is null\`);
process.exit(0);"
# worker 常驻进程会按 next_fetch_at 立即开抓
```

## 故障速查

| 症状 | 检查 |
|---|---|
| X 源全失败 | rsshub 容器日志、TWITTER_AUTH_TOKEN、`sources:audit` |
| LLM 不产出 | LLM_API_KEY/LLM_PROVIDER、spend_guard 是否触顶（后台可见） |
| 页面 5xx | web 容器日志、DATABASE_URL、迁移是否跑过 |
| 内存吃紧 | 3.5GB 机器避免并行构建；本 compose 全部为拉取式 |
