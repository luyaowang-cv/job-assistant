# F-001：投递看板核心 — Implementation Plan

## 1. 目标与实施策略

F-001 不从空目录搭建后台。直接以 Element Plus Nuxt Starter 作为 web/ 根工程，保留其 Nuxt、TypeScript、Element Plus、SSR 与 Docker 基础配置；在其上增加 Prisma、PostgreSQL、单用户服务层和投递看板业务模块。

本 Feature 只完成“岗位/投递记录 → 看板推进 → 下一步安排 → 过程时间线”的可用闭环。插件、Agent、简历优化和面试管理不在本 Feature 实现。

## 2. 上游复用清单

| 来源 | 导入/保留 | 不导入 |
|---|---|---|
| element-plus/element-plus-nuxt-starter | Nuxt 配置、Element Plus 接入、应用目录、服务端目录、Docker 基础配置、Lint/TypeScript 配置 | 示例业务页面与无关样式 |
| un-pany/v3-admin-vite | Layout 信息架构、侧栏/顶栏交互、表格筛选/空状态的 UI 模式 | Vite 配置、路由、权限体系和业务 Store |
| Vue 拖拽库（Plan 实施时选定） | 看板的排序/跨列拖拽能力 | 与领域状态无关的 Demo 数据 |

首次导入时记录上游 commit、许可证文件和本地改造说明。

## 3. 目标目录

- web/app/layouts/default.vue：工作台框架。
- web/app/pages/applications/index.vue：看板与列表入口。
- web/app/components/applications/：看板列、卡片、筛选栏、详情抽屉、表单。
- web/app/stores/application.ts：页面查询与交互状态。
- web/server/api/v1/applications/：REST 路由。
- web/server/services/：Application 服务层、local user 解析、事件记录。
- web/server/schemas/：Zod 输入输出 Schema。
- web/prisma/schema.prisma：领域模型和迁移。

## 4. 数据与领域实现

### 4.1 初始模型

- User：初始化固定 local user。
- Company：名称、官网、行业、公司类型。
- Job：公司关联、岗位名、部门、地点、薪资、来源、链接、JD、截止日期。
- Application：Job 和 local user 关联；状态、渠道、投递日期、下一步、下一步日期、备注。
- ApplicationEvent：创建、字段编辑、状态变更、删除等事件；保存事件类型、时间、结构化 payload。

### 4.2 删除决策

F-001 当前 Spec 中的“硬删除 + 保留删除事件”存在冲突：硬删除 Application 时，关联事件通常也会消失。Plan 推荐改为软删除：

- Application 增加 deletedAt。
- 默认查询排除 deletedAt 不为空的记录。
- 删除操作写入 DELETE 事件。
- UI 中删除后不显示；回收站不在 F-001 实现。

这个决定需要在进入 Tasks 前回写 Feature Spec 和领域契约。

### 4.3 状态流转

允许任意非删除状态之间的用户主动迁移；系统不擅自决定状态。每次状态变化写 STATUS_CHANGED 事件，payload 至少包含 fromStatus、toStatus、source。

## 5. API 设计

| Method | Endpoint | 用途 |
|---|---|---|
| GET | /api/v1/applications | 分页、搜索、状态/公司/渠道筛选 |
| POST | /api/v1/applications | 创建 Company、Job、Application 的最小闭环 |
| GET | /api/v1/applications/:id | 获取详情和时间线 |
| PATCH | /api/v1/applications/:id | 编辑岗位与投递字段 |
| PATCH | /api/v1/applications/:id/status | 更新状态并记录事件 |
| DELETE | /api/v1/applications/:id | 软删除并记录事件 |

所有路由调用服务层；服务层负责 local user、事务、ApplicationEvent 和 Zod 校验后的数据处理。前端不传 userId。

## 6. UI 设计

### 6.1 页面框架

- 左侧：应用名称与导航；F-001 仅启用“投递看板”。
- 顶部：页面标题、新增投递按钮、视图切换。
- 主体：Kanban / List 双视图。
- 右侧抽屉：记录详情、编辑表单、过程时间线。

### 6.2 看板

显示 8 个状态列。卡片显示公司、岗位、地点、薪资、来源、投递日期、下一步日期。支持跨列拖拽；失败时 UI 回滚并提示。

### 6.3 列表与筛选

搜索公司/岗位；按状态、来源渠道、公司筛选；空状态给出“创建第一条投递”入口。MVP 不做服务端复杂排序和保存筛选条件。

## 7. 实施顺序

1. 从官方 Starter 建立 web/，保留许可与溯源信息。
2. 配置 PostgreSQL、Prisma、环境变量样例和 local user seed。
3. 定义 Prisma 模型，执行初始迁移。
4. 实现 Zod Schema、服务层、API 与事件记录。
5. 实现默认 Layout、应用列表与创建表单。
6. 实现 Kanban、状态更新和详情抽屉。
7. 加入拖拽、筛选、软删除与空状态。
8. 编写 API、服务层和核心 UI 的验证。
9. 更新 F-001 Spec、契约和 README 的实际实现状态。

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Starter 的 Node/依赖版本与 Prisma 不兼容 | 导入后先完成 build/lint，再添加 Prisma；锁定 package manager 与版本 |
| SSR 下 Element Plus 客户端组件行为差异 | 复用官方 Starter 的 Nuxt 配置；拖拽组件必要时仅在 ClientOnly 中渲染 |
| 拖拽 UI 与持久化状态不一致 | 乐观更新失败即回滚；API 以服务端状态为准 |
| 单用户模式未来难迁移 | 从第一天保留 User 关联与服务端身份解析，不在浏览器写死 userId |
| 软删除与 Spec 不一致 | Tasks 前先获得确认并回写契约，避免代码漂移 |

## 9. 验证策略

- 数据层：Prisma migration 可在空数据库执行；local user 可重复初始化。
- 服务层：创建、编辑、状态更新、软删除均产生对应事件。
- API：Zod 拒绝缺失公司/岗位/状态等无效输入；响应符合 API 契约。
- UI：创建后刷新仍可见；状态迁移持久化；删除后默认查询不返回；筛选与空状态正确。
- 工程：Nuxt build、lint、类型检查通过。

## 10. Plan 完成前待确认

1. 采用软删除替代当前 Spec 中的硬删除，以满足事件审计需求。
2. web/ 使用官方 Element Plus Nuxt Starter；插件和 Agent 不在 F-001 建立。



## 已确认决策更新

- 软删除方案已确认：Application 使用 deletedAt，默认查询排除已删除记录，删除操作写入 DELETE 事件；F-001 不实现回收站。
- 本节覆盖原“Plan 完成前待确认”中关于软删除的待定项。
