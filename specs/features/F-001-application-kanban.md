# F-001：投递看板核心

## Goal

建立单用户秋招 MVP 的核心数据闭环：用户可以手动创建、查看、编辑和推进一条投递记录，并在看板中明确下一步行动。

## User scenarios

1. 用户创建一条岗位/投递记录，填写公司、岗位、地点、渠道、链接和 JD。
2. 用户在看板中查看不同阶段的投递，并将记录拖动到新阶段。
3. 用户打开详情，补充备注、投递日期、下一步安排和下一步日期。
4. 用户用列表按公司、状态、渠道和创建时间筛选记录。
5. 用户删除误录记录，并得到明确反馈。

## In scope

- Nuxt 4 + Vue 3 + Element Plus 工作台基础布局。
- 单用户本地模式：服务端固定解析为 local user，不提供注册、登录或多用户切换。
- Company、Job、Application、ApplicationEvent 的 Prisma 数据模型与初始迁移。
- 投递记录 CRUD API。
- 看板与列表视图；状态：SAVED、PREPARING、APPLIED、WRITTEN_TEST、INTERVIEWING、OFFERED、REJECTED、WITHDRAWN。
- 拖拽或等价交互更新状态。
- 详情抽屉/弹窗编辑岗位与投递字段。
- 创建、状态变更、编辑、删除均写入 ApplicationEvent。
- 基础筛选、搜索和空状态。
- 软删除：删除后默认查询和 UI 不显示该记录，但保留审计事件。

## Out of scope

- Chrome 插件采集与插件鉴权（F-002）。
- AI 打招呼话、岗位匹配、LangGraph 工作流（F-003）。
- 完整登录、注册、权限与多用户隔离。
- 公司调研、简历编辑、面试助手、提醒发送和数据分析。
- 自动投递、职位网站爬虫或批量采集。
- 回收站 UI 与恢复已删除记录。

## Acceptance criteria

1. 用户可从 UI 创建一条投递记录，刷新后仍能看到它。
2. 创建至少要求公司名称、岗位名称和投递状态；其他字段可选。
3. 看板显示 8 个状态列；拖动或状态选择后，记录持久化到新状态。
4. 详情编辑后，岗位字段、备注与下一步安排不丢失。
5. 每次创建、编辑、状态变更或删除都会创建可查询的 ApplicationEvent。
6. 列表可按状态、公司名称、渠道筛选，并支持关键词搜索。
7. 删除操作要求用户确认；成功后记录不再出现在默认看板或列表，但数据库保留 deletedAt 和 DELETE 事件。
8. 所有 API 输入经 Zod 校验，错误响应符合 api-conventions.md。
9. 未配置真实登录时，所有请求归属同一 local user，客户端不得传 userId。
10. 空数据库下页面正常加载，并展示创建第一条投递的引导。

## Affected contracts

- specs/contracts/domain-model.md
- specs/contracts/api-conventions.md
- 后续新增：Prisma schema、Application API 契约

## Confirmed decisions

- 删除采用软删除；F-001 不实现回收站和恢复。
- Job 与 Application 在 MVP 为一对一创建路径；领域模型保留同岗位多次投递的扩展空间。
- 拖拽库在实施任务中选择，优先评估 Vue Draggable Plus 或原生 Pointer Events。
