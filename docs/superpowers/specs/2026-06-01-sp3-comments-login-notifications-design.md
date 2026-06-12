# SP3 设计 — 评论区 + 邮箱登录 + 通知（点 7）

状态：**待用户确认**（设计稿，未实现）。分支 `feat/spend-guard-and-reader-polish`。

## 需求拆解（点 7）
1. **内联评论** —— 读者能在动态流里直接看到/展开评论，而不必跳事件详情页。
2. **评论点赞 / 回复** —— 评论可被点赞；可对评论回复（楼中楼）。
3. **邮箱登录，默认不登录** —— 读者默认匿名（现有 `rid` cookie 指纹），可选邮箱登录；登录后身份用于评论/反应/通知。
4. **右上角通知收件箱** —— 登录用户能收到与自己相关的通知（评论被回复/被赞、推荐信源通过等），带未读计数。

## 现有基础设施（复用）
- `event_comments`：扁平评论，`userId XOR fingerprint` 身份，确定性低质分类器，3 段式列表（专家观点/高质量/最新），bodyHash 幂等去重。**无回复、无点赞。**
- `event_reactions`：like/star，同 XOR 身份 + 部分唯一索引去重。
- `reader-id`：中间件给匿名访客种签名 `rid` cookie（指纹）。
- better-auth：邮箱/密码登录已存在，但当前 `login/page.tsx` 登录后跳 `/_admin`（面向管理员）。`user.role` 有 `expert`。
- 阅读器首页 A/S 卡片有 `comment-ticker`（滚动展示 top 评论）；事件详情页 `comments-section` + `comment-composer`。

## 设计决策（建议值，待锁定）

### A. 评论回复（楼中楼）
- `event_comments` 加自引用 `parent_id text references event_comments(id)`（**migration 0013**）。顶层评论 parent_id=null。
- 回复**只允许一层**（回复的回复仍挂在顶层父评论下，UI 用 `@昵称` 体现），避免深层递归与无界渲染。`addComment` 增加可选 `parentId`，校验父评论存在且属于同一 event 且本身是顶层。
- 列表层 `listEventComments` 顶层评论附带其 replies（一次查询 + JS 分桶），低质回复同样隐藏。
- **开放点 A1**：回复是否也跑低质分类器？建议**跑**（一致）。

### B. 评论点赞
- 新表 `comment_reactions`（**同 migration 0013**）：`id / comment_id / kind('like') / userId / fingerprint / created_at`，部分唯一索引按身份去重（复用 event_reactions 模式）。`event_comments` 加去规范化 `like_count int default 0`，由 add/remove 事务维护。
- 高质量段排序从「最新」升级为「按 like_count desc, created_at desc」——顺带解决 comments.ts 里 “V1: 按最新” 的 TODO。
- **开放点 B1**：是否给评论加 star/“踩”？建议**只 like**（KISS）。

### C. 内联评论（动态流）
- 复用现有 `comment-ticker`（A/S 已用）。新增：卡片底部「N 条讨论」按钮，点开**内联展开** top 顶层评论 + 内联 composer（客户端组件，懒加载该 event 的评论）。不跳详情页。
- 详情页仍是完整 3 段式 + 全量回复的权威视图。
- **开放点 C1**：内联评论对所有卡片开放，还是仅 selected（B/A/S）？建议**所有卡片**（点 7 要“内联评论”通用）。

### D. 邮箱登录（读者侧，默认匿名）
- 新增读者注册：`authClient.signUp.email`（better-auth 已支持）。读者注册的 `user.role` 默认普通（非 expert/admin）。
- masthead 右上角：未登录显示「登录/注册」；已登录显示昵称 + 退出。登录后**留在当前页**（不再跳 `/_admin`；`/_admin` 仅在 role=admin 时可见入口）。
- 身份合一：已登录时评论/反应用 `userId`；匿名时用 `fingerprint`（现状）。**不做**匿名→登录的历史合并（YAGNI；登录后新行为归 userId）。
- **开放点 D1**：是否需要邮箱验证 / 找回密码？建议 V1 **不强制邮箱验证**（better-auth 默认），找回密码留后续。

### E. 通知收件箱
- 新表 `notifications`（**migration 0013**）：`id / user_id / kind / title / body / target_type / target_id / read_at / created_at`。kind 枚举：`comment_reply / comment_like / source_approved`（点 7 + 复用现有贡献/信源审核）。
- 仅**登录用户**有收件箱（匿名指纹不可靠寻址；不为匿名建通知）。写入点：
  - 回复他人评论 → 给父评论作者（若有 userId）发 `comment_reply`。
  - 点赞他人评论 → 给评论作者发 `comment_like`（同一 (comment,actor) 去重，避免反复赞刷屏）。
  - 信源推荐 `applied` → 给推荐人（若关联 userId）发 `source_approved`。
- masthead 右上角铃铛 + 未读数（SSR 读未读计数）；`/notifications` 列表页，点开标记已读；`POST /api/notifications/read`。
- **开放点 E1**：通知是否实时（轮询/SSE）？建议 V1 **SSR + 进页刷新**，不做实时推送。

## 迁移与测试
- **migration 0013**：event_comments.parent_id + event_comments.like_count + comment_reactions 表 + notifications 表（+ 部分唯一索引）。
- 测试：addComment 回复（父校验/一层折叠/低质回复隐藏）；comment 点赞幂等 + 计数事务；高质量段按赞排序；通知写入（回复/赞/信源通过各一条 + 去重）；读者登录身份切换（userId vs fingerprint）；内联评论 API。

## 实现顺序（建议）
1. migration 0013 + schema。
2. 回复 + 评论点赞（query 层 + 详情页 UI）。
3. 内联评论（流内展开 + composer）。
4. 读者邮箱登录（masthead 入口 + 注册 + 身份合一）。
5. 通知（表 + 写入点 + 铃铛 + 列表页）。

> 风险：点 7 体量与 SP2 相当（一个迁移 + 多处 UI + 通知子系统）。可拆成 3.1（评论增强）/3.2（读者登录）/3.3（通知）分别提交。
