# 微信公众号接入（wewe-rss 桥接）

公众号（如「数字生命卡兹克」）没有公开 feed。生产栈用自托管
[wewe-rss](https://github.com/cooderl/wewe-rss)（`cooderl/wewe-rss-sqlite` 镜像，
compose 服务名 `wewe-rss`）把公众号文章转成 Atom feed，再由 worker 现有的 `rss`
连接器消费 —— **没有新增连接器类型**。

## 架构

```
公众号文章 → wewe-rss（绑定微信读书账号抓取）→ /feeds/<id>.atom → rss 连接器 → posts
```

- SSRF 守卫：`safeFetch` 默认拦截 Docker 内网 IP。`WEWE_RSS_BASE_URL`
  （如 `http://wewe-rss:4000`）的主机名会被 `internalFeedAllowHosts()` 精确放行
  （与 `rsshubAllowHosts` 同模式，不开放通配旁路）。
- 更新频率：compose 里 `CRON_EXPRESSION: "35 5,17 * * *"`（每天两次），降低微信
  风控/封号概率。**风险提示**：绑定的微信读书账号存在被限制的可能，建议用小号。

## 运维步骤（一次性，需要人工扫码）

1. 服务器 `.env` 增加：
   ```
   WEWE_RSS_AUTH_CODE=<随机串，管理台口令>
   WEWE_RSS_BASE_URL=http://wewe-rss:4000
   ```
2. `IMAGE_TAG=<tag> docker compose -p aiwatch -f docker-compose.prod.yml up -d wewe-rss`
3. 本机 ssh 端口转发后打开管理台（端口仅绑 127.0.0.1）：
   `ssh -i ~/.ssh/aiwatch_deploy -L 4001:127.0.0.1:4001 root@8.219.61.189`
   → 浏览器 `http://localhost:4001` → 输入 AUTH_CODE。
4. 「账号管理」→ 添加账号 → **用微信扫码登录微信读书**。
5. 「公众号源」→ 添加「数字生命卡兹克」（搜索或粘贴文章链接）→ 记下生成的 feed 地址
   `http://wewe-rss:4000/feeds/<id>.atom`。
6. 在 `/_admin` 信源管理「新增信源」创建：
   - 平台 `rss`，抓取方式 `rss`，connectorRef = 上面的 feed 地址
   - 名称「数字生命卡兹克」，sourceType `kol`，level `L3`，category `technical_share`
7. 等下一轮抓取，确认 `_admin` 健康面板该源状态为「正常」。

## 后续加公众号

重复步骤 5–6 即可（同一个微信读书账号可订阅多个公众号）。
