# F-020 Implementation Plan

## Follow-up: fixed target Bitable table

飞书左侧“26、27校招汇总表”是导航文件夹，不是可导入的数据表。默认链接已锁定 `table=tblH4au5rnBcqHgJ`（27届秋招🌸），服务端要求链接携带 `table=tbl...`，并只读取该 ID 的全部记录；其他顶部标签页不会被读取。弹窗不显示飞书左侧导航，也不需要额外选择数据表。

导入过程保持单个数据库事务以保障重同步原子性；由于来源包含近百条记录，事务超时显式设为三分钟，避免 Prisma 默认五秒时限中断正常同步。

## Architecture approach

岗位库由 `Job`/`Company` 事实数据驱动，不与 `Application` 合并。服务端使用飞书 OAuth2：用户在本地浏览器授权后，服务端以该用户的 `user_access_token` 读取其已可见的多维表格，而不要求应用被加入表格协作者。access/refresh token 以 AES-GCM 加密保存，OAuth state 用 HMAC 签名并限时。链接、令牌和应用凭据均不会返回客户端。

导入服务将飞书字段映射为经 Zod 校验的候选岗位，使用「公司名称 + 岗位名称 + sourceDocId」进行 upsert，并在同一来源文档的本轮同步中将未出现的岗位标记 `offlineAt`，不物理删除。岗位库查询和“转为投递”均由服务端获取本地用户；后者通过数据库唯一约束创建一条 `SAVED` Application 并记录 CREATE 事件。

前端以现有工作台的半透明数据表视觉为基础：同步入口、搜索和筛选工具栏位于表格上方；宽屏显示完整列，窄屏保留公司、岗位与关键操作，避免横向滚动成为唯一可用方式。

## Contract changes

- `Job` 增加 `recruitmentType`、`announcementUrl`、`hasWrittenTest`、`sourceDocId`、`sourceUpdatedAt`、`syncedAt`、`offlineAt`；`Company.industry` 和 `companyType` 承接来源分类。
- 新增岗位库列表、飞书同步、转为投递 API，均使用 Zod 输入校验。
- 飞书同步需要服务端 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 与 `FEISHU_OAUTH_REDIRECT_URI`；缺失、未连接或无读取授权时不写入数据，并返回明确可恢复错误。

## Implementation sequence

1. 更新领域/API 契约，编写计划和可独立验证的任务。
2. 扩展 Prisma 模型并添加迁移；实现加密 OAuth token、授权回调与用户身份飞书读取。
3. 新增岗位库 API 路由和服务测试，覆盖映射、授权状态、离线标记与重复转投递。
4. 以真实数据替换 `/jobs` 占位页，接入连接飞书、同步、筛选、分页、外链和转投递交互。
5. 运行 Prisma 生成、服务测试、类型检查、lint 和构建；在桌面与窄屏检查页面。

## Risks and mitigations

- 飞书多维表格 API 需要 tenant access token，公开分享链接不是匿名 API 凭据：仅在服务端读取环境变量，不回传密钥；配置缺失时阻止同步而不是产生半成品数据。
- 飞书字段可能存在富文本、链接对象和不同日期格式：统一归一化后再由 Zod 校验；空公司或岗位名称的记录被拒绝且不会落库。
- 同公司同岗位可能在不同地点重复：MVP 按规格使用公司+岗位+来源文档匹配，地点变化更新既有记录；这一限制已记录在 feature 风险中。
- 并发转投递：依靠 `Application(userId, jobId)` 唯一约束处理并返回已存在状态。

## Verification strategy

- 服务测试：字段映射/非法行、同步 upsert 与 offline 标记、转投递幂等。
- `pnpm db:generate`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。
- 在 `/jobs` 检查空态、加载/错误反馈、同步结果、外链和 390px 窄屏布局。
