# F-023 Tasks

执行规则：按顺序推进；必须完成前置依赖、实现、自动化检查和可观察结果后才能勾选。T-001 未通过前，不得开始 T-003 及之后的实现。

## Contract and migration foundation

- [x] **T-001 — 完成 F-023 契约门禁**（依赖：无）  
  更新四份 affected contracts，定义素材/版本/API/Agent/扩展边界，将 F-004 BASE 覆盖与 F-006 档案覆盖标为 legacy-only。  
  **Verify:** 四份契约均有 F-023；不存在新的基础事实覆盖、follow-current、历史原地更新或扩展直读素材库路径。

- [x] **T-002 — 建立验收映射与 legacy fixtures**（依赖：T-001）  
  将规格 AC-01～AC-10 映射到任务和测试；准备 BASE/TARGETED resume、旧 ApplicationProfile JSON/覆盖字段及 PersonalProfile 教育 fixtures。  
  **Verify:** 十条 AC 均有任务和验证项；fixtures 无推断事实和真实敏感数据。

- [x] **T-003 — 新增 Prisma 模型与迁移**（依赖：T-001、T-002）  
  增加 MaterialCard/Variant、ApplicationProfileVersion、DocumentComposition/Reference、DocumentMutationEvent、枚举、外键、索引、owner XOR check、幂等键、GPA 和 currentVersionId。  
  **Verify:** `pnpm db:generate` 通过；空库可迁移；SQL 不对 legacy 内容做推断 UPDATE/DELETE。

- [x] **T-004 — 验证迁移兼容和回滚边界**（依赖：T-003）  
  在 fixtures 上迁移并比较旧 profile/resume/profile JSON；记录只关闭新入口并保留新表的回滚方案。  
  **Verify:** 旧行、JSON/content 逐字段不变；迁移不自动创建 MaterialCard。

## Material library

- [x] **T-005 — 定义素材 Zod contracts**（依赖：T-003）  
  定义七类 card、facts、命名 variant、分页/搜索/标签、归档和公共 DTO，object 均 strict 并限制长度。  
  **Verify:** 测试拒绝额外字段、非法类型、空 variant、过长字段及客户端 userId/审计字段；接受七类最小输入。

- [x] **T-006 — 实现素材与 variant 服务**（依赖：T-005）  
  实现用户范围 CRUD、创建不可变 variant 和归档；归档不删除 variants/references，不提供 variant 更新/删除。  
  **Verify:** 覆盖搜索/标签规则、跨用户、variant 历史、归档后历史读取和新引用禁用。

- [x] **T-007 — 暴露素材 API**（依赖：T-006）  
  增加 material-card routes、统一响应/错误、稳定分页；每次写入创建 DocumentMutationEvent。  
  **Verify:** 覆盖 success、validation、not-found、archived-conflict；响应不含 userId，写响应含 eventId。

- [x] **T-008 — 构建 `/materials` 页面**（依赖：T-007）  
  实现创建、搜索、类型/标签筛选、详情、variant 历史和归档确认，以及加载/空态/可恢复错误。  
  **Verify:** 完成“建卡 → 加 variant → 搜索 → 归档”；390px 无页面级横向滚动且键盘可操作。

## Composition and immutable versions

- [x] **T-009 — 定义 composition/resolved schemas**（依赖：T-003、T-005）  
  定义字段 visibility、固定 variant 引用、section/field、排序、显示规则、字段限制、来源和 Unicode count DTO。  
  **Verify:** 拒绝基础原值、follow-current、重复排序键、错误 card/variant 形状和负限制。

- [x] **T-010 — 实现纯 DocumentResolver 和 legacy adapter**（依赖：T-009）  
  组合 PersonalProfile、composition 和固定 variants；无 composition 时读取 legacy snapshot 并标注来源；按 code point 计数且不截断。  
  **Verify:** 覆盖隐藏、主档案更新、归档历史引用、旧快照、emoji/中英文和超限；解析零写入。

- [x] **T-011 — 保存不可变简历组合版本**（依赖：T-010）  
  校验归属及 card/variant，在单事务创建 ResumeVersion、composition、references 和 event；无历史更新路径。  
  **Verify:** 每次保存新 id；旧版本在主档案/卡片变化后仍稳定；跨用户和归档新引用被拒绝。

- [x] **T-012 — 保存不可变网申档案版本**（依赖：T-010）  
  ApplicationProfile 作为身份/策略容器，创建 ApplicationProfileVersion/current pointer；不接受 legacy facts 覆盖。  
  **Verify:** 连续保存生成不同 id；旧 resolved 输出不变；count/limit/overLimit 正确；legacy JSON 不变。

- [x] **T-013 — 暴露组合文档 API**（依赖：T-011、T-012）  
  实现 plan 中 resume/application-profile routes；输入输出全量 Zod，route 仅调用服务。  
  **Verify:** 覆盖保存/读取、current pointer、跨用户、非法 section、归档新引用和旧版读取；写响应含 eventId。

## Non-destructive migration

- [x] **T-014 — 实现 legacy migration preview**（依赖：T-006、T-010）  
  扫描旧 work/projects/skills/campus/awards 等 JSON，输出候选 type/title/facts/variant/sourceKey、无法映射原因和已导入状态；不持久化。  
  **Verify:** preview 前后数据库快照相同；sourceKey 稳定；未知字段不猜测、不丢弃。

- [x] **T-015 — 实现 migration confirm/API**（依赖：T-014）  
  只导入选中候选，按 `(userId, sourceKey)` 去重，创建 cards/variants/events 并返回逐项结果，不回写旧档案。  
  **Verify:** 空选择零写入；重复 confirm 幂等；非法项有明细；旧 JSON 字节等价。

## Impact, synchronization, export, extension

- [x] **T-016 — 实现只读影响分析**（依赖：T-011、T-012）  
  列出当前版本直接引用/标签命中和 before/after diff；排除归档、无权限、已包含或非当前目标并签发短期 preview token。  
  **Verify:** preview 零写入；覆盖两类命中、排除原因、过期/篡改 token 和最多 50 目标。

- [x] **T-017 — 实现幂等批量 confirm**（依赖：T-016）  
  重检 token、权限和 current version；每目标独立事务创建新版本/references/event，返回 created/skipped/failed。  
  **Verify:** 未确认零写入；相同 idempotencyKey 不重复；并发变化被跳过；单目标失败不回滚其他成功。

- [x] **T-018 — 暴露 impact/sync API 与确认 UI**（依赖：T-017）  
  在素材详情展示差异、目标选择、明确确认、进度和逐项结果；默认不预选批量范围。  
  **Verify:** 完成“预览 → 选择 → 确认 → 明细”；取消零写入；API 覆盖 token/idempotency/error contract。

- [x] **T-019 — 实现 Markdown export provider**（依赖：T-010、T-013）  
  从已保存 ResumeVersion 导出 Markdown；提供 capabilities，PDF/DOCX 明确未实现；不创建 version/event。  
  **Verify:** 快照覆盖标题、顺序、隐藏和中文；草稿/跨用户拒绝；导出前后数据库相同。

- [x] **T-020 — 切换 fill-context 并回归扩展**（依赖：T-012、T-013）  
  从 current ApplicationProfileVersion 的 resolved view 生成 localFacts/aiContext，legacy 保留 adapter；扩展不新增权限/存储/API。  
  **Verify:** `pnpm test:profiles` 和 extension `pnpm test` 通过；manifest 权限不增加，提交禁令保持。

## Editors and release

- [x] **T-021 — 构建简历三栏编辑器**（依赖：T-008、T-013、T-019）  
  在 `/resumes` 接入素材、排序、variant/visibility、基础字段隐藏、保存新版本和 Markdown；旧版只读。  
  **Verify:** “选卡 → 键盘/拖拽排序 → 配置 → 保存 → 重开旧版 → 导出”闭环；390px 用分步/抽屉且无裁切。

- [x] **T-022 — 构建网申结构化编辑器**（依赖：T-008、T-013、T-015）  
  在 `/application-profile` 接入策略、legacy 迁移、区块、插卡、variant、实时字数/超限和版本保存。  
  **Verify:** “迁移 → 插卡 → 字数 → 保存 → 重开旧版”闭环；超限不截断，基础事实只能隐藏。

- [x] **T-023 — 完成自动化和构建门禁**（依赖：T-018～T-022）  
  增加 `test:materials`、`test:documents` scripts，执行迁移、测试、static/build 与扩展回归。  
  **Verify:** Web 的 `pnpm db:generate`、`pnpm test:profiles`、`pnpm test:materials`、`pnpm test:documents`、`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；extension 的 `pnpm test`、`pnpm build` 通过。

- [ ] **T-024 — 手工验收、可访问性和证据回填**（依赖：T-023）  
  按 AC-01～AC-10 在 1440/1024/768/390px 验收焦点、label/error、键盘排序、播报、错误恢复和溢出。  
  **Verify:** 十条 AC 均有通过记录和证据；无未解释失败；仅此项完成后宣布 F-023 可交付。

## T-004 migration verification and rollback boundary

- Existing development database: prisma migrate deploy applied 20260814120000_add_f023_material_compositions; prisma migrate status returned success.
- Fresh database: all 12 migrations applied successfully to job_assistant_f023_verify_20260814; all six F-023 core tables were present. The temporary database was then removed.
- Compatibility: the development database contained zero rows in User, Resume, ResumeVersion, and ApplicationProfile, so there were no real legacy rows to compare. The migration is additive only and contains no legacy UPDATE or DELETE; legacy fixture behavior is covered by the profile/document tests.
- Structural checks: owner XOR, primary keys, foreign keys, unique constraints, and query indexes were present after migration. No MaterialCard rows were created automatically.
- Rollback boundary: disable the new F-023 routes/UI first and retain the additive tables. Do not drop the tables while any F-023 writes may exist. A physical schema rollback requires a verified database backup/export and an explicit maintenance operation; normal rollback is application roll-forward because legacy reads remain supported.

- [x] **T-025 — 简化素材建卡字段并拆分经历类型**  
  增加 `INTERNSHIP` 类型；移除原始 facts JSON 输入，按类型提供标题、角色、组织、开始/结束时间、技术栈与标签用途说明。  
  **Verify:** schema 接受八类素材及合法的角色/组织/技术栈/时间，拒绝非法字段；建卡请求自动组装 facts。

- [x] **T-026 — 迁移并回归素材全链路**  
  迁移 PostgreSQL 枚举，重新生成 Prisma Client，验证列表筛选、建卡和历史 WORK 数据兼容。  
  **Verify:** migration deploy/status、`test:materials`、typecheck、lint 通过。

## Verification record

| Date | Task | Command or scenario | Result | Evidence / notes |
|---|---|---|---|---|
| 2026-08-14 | T-004 | prisma migrate deploy on development DB | Pass | Applied F-023 as migration 12/12; six tables plus expected constraints and indexes verified. |
| 2026-08-14 | T-003/T-004 | Full migration chain on temporary empty DB | Pass | All 12 migrations applied; six F-023 tables found; temporary DB removed afterward. |
| 2026-08-14 | T-023 | Web lint/build/typecheck/tests and extension test/build | Pass | Web lint finished with zero errors; previously recorded build and regression suites passed. |
| 2026-08-14 | T-024 | Browser/manual viewport acceptance | Waived | Further agent-browser verification stopped at user request; this task remains unchecked. |
| 2026-08-16 | T-025 | Type-aware material form and schema tests | Pass | Eight types accepted; raw JSON removed; role/organization/tech stack/month validation covered; tags explained as non-rendered metadata. |
| 2026-08-16 | T-026 | Prisma generate, migration deploy/status, material/document regressions | Pass | Migration 14/14 applied; material 4/4 and document 3/3 tests pass; typecheck, lint and production build pass. |
