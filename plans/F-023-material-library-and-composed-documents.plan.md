# F-023 Implementation Plan

## Architecture approach

### Delivery gates

F-023 按“契约 → 数据 → 纯解析 → 写服务/API → 编辑器 → 扩展兼容 → 验收”推进：

1. **G1 契约**：四份受影响契约消除 F-004/F-006/F-011 的旧语义冲突。
2. **G2 数据**：迁移只新增结构；现有 `PersonalProfile`、`ResumeVersion.content` 和 `ApplicationProfile` JSON 原样可读，不生成推断数据。
3. **G3 服务**：解析、迁移预览、影响分析均无副作用；写服务验证归属并记录版本/事件。
4. **G4 产品**：素材库、简历和网申编辑器形成保存闭环；扩展只消费 resolved fill-context。
5. **G5 发布**：自动化、迁移回归、响应式和可访问性通过，证据回填 tasks。

第一阶段不实现 AI 文案、PDF/DOCX、自动填写/提交或旧 JSON 删除。Markdown 只导出已保存版本。

### Source-of-truth and versions

```text
PersonalProfile ───────────────┐
MaterialCardVariant ──────────┼─ DocumentResolver ─→ UI / Markdown / fill-context
saved DocumentComposition ────┘

legacy ApplicationProfile JSON ─→ read-only preview ─→ explicit confirm ─→ MaterialCard
material change ─→ read-only impact preview ─→ explicit confirm ─→ new document versions
```

- `PersonalProfile` 是基础事实唯一来源；文档只能保存字段可见性，不能保存基础事实覆盖值。
- `MaterialCard` 保存类型、标题、可选标签、结构化事实和归档状态；实习与正式工作使用独立类型。经历时间由表单写入 `facts.startDate/endDate`，产品界面不提供原始 JSON 编辑器；`MaterialCardVariant` 是不可变命名文案。编辑文案即创建新 variant。
- `Resume`、`ApplicationProfile` 是文档身份；`ResumeVersion`、新增 `ApplicationProfileVersion` 是不可变保存版本。
- 每个新版本恰有一个 `DocumentComposition`；`DocumentCardReference` 固定 `variantId`、目标区块/字段、排序和显示规则。保存后禁止 follow-current，保证历史可复现。
- `ResumeVersion.content` 和旧 ApplicationProfile 分类 JSON 是 legacy snapshot；无 composition 时由兼容 adapter 读取，新保存不回写它们。
- `DocumentMutationEvent` 记录用户可见写入。批量确认用 `(userId, idempotencyKey)` 防重并返回逐目标 `created | skipped | failed`。

### G1 required decisions

- 教育唯一来源为 `PersonalProfile.educations`；学历、学位、院校、专业、可选 GPA 都是显式字段，不从文本推断。
- F-023 生效后，组合式 BASE 保存创建新 `ResumeVersion`；旧 BASE 原地替换行为只兼容旧数据。
- F-006 的 ApplicationProfile basics/educations 覆盖停止新增写入；存量覆盖仅由 legacy adapter 读取并标注来源。
- ApplicationProfile 保留名称、标签、策略和 currentVersionId；ApplicationProfileVersion 承载结构化区块、字段限制和 composition。
- “精简/隐藏技术细节”只能选择已有 variant 或执行确定性显示规则，不能自由改写正文。

### Service boundaries

- `material-card.service.ts`：CRUD、创建 variant、归档；归档不删除历史引用。
- `document-composition.service.ts`：校验归属、card/variant 匹配、区块和排序，事务性保存新版本。
- `document-resolver.ts`：纯函数组合 profile、composition、fixed variants，输出值、来源和字符计数。
- `legacy-material-migration.service.ts`：生成稳定 sourceKey 候选；确认只导入选中项，不回写旧档案。
- `document-impact.service.ts`：当前文档引用/标签命中与 before/after diff；preview 零写入。
- `document-sync.service.ts`：确认时重新校验，每个目标独立事务创建新版本/事件。
- `document-export.service.ts`：provider 架构；首期只有 Markdown，PDF/DOCX 返回 `NOT_IMPLEMENTED`。
- API route 只做参数读取、Zod 校验、服务调用和统一响应，不直接写 Prisma。

### API surface

所有请求和响应都在 `web/server/schemas/` 用 Zod 定义；客户端不得传 userId、审计或事件字段。

| Capability | Routes |
|---|---|
| 素材库 | `GET/POST /api/v1/material-cards`；`GET/PATCH /api/v1/material-cards/:id`；`POST .../:id/variants`；`POST .../:id/archive` |
| 迁移 | `POST /api/v1/material-migrations/application-profiles/:id/preview`；`POST .../:id/confirm` |
| 简历组合 | `GET /api/v1/resumes/:id/versions/:versionId/composition`；`POST /api/v1/resumes/:id/composed-versions` |
| 网申组合 | `GET/POST /api/v1/application-profiles/:id/versions`；`GET .../:versionId/resolved` |
| 影响/同步 | `POST /api/v1/material-cards/:id/impact-preview`；`POST .../:id/sync` |
| 导出 | `GET /api/v1/resumes/:id/versions/:versionId/exports/markdown`；`GET /api/v1/document-export-capabilities` |

写响应返回资源和 event id；preview 不返回 event id。跨用户、不存在、已归档的新引用及 card/variant 不匹配必须拒绝；历史读取可解析已归档卡片。

### UI and extension

- 新增 `/materials`：搜索、类型/标签筛选、variant 历史和归档。
- `/resumes`：左素材、中画布、右配置；窄屏用分步/抽屉，键盘可加入、排序、移除和保存。
- `/application-profile`：保留身份/策略，增加不可变版本、结构化插卡、字符计数和 legacy 迁移入口。
- fill-context 从 current ApplicationProfileVersion 的 resolved view 生成；扩展不增加权限、存储或素材 API 访问。

## Contract changes

G1 完成前不得开始 Prisma 或产品代码：

- `domain-model.md`：新增 MaterialCard/Variant、ApplicationProfileVersion、DocumentComposition/Reference、DocumentMutationEvent、归属/索引/不可变规则和 GPA；F-004 BASE 覆盖、F-006 覆盖写入标为 legacy-only。
- `api-conventions.md`：固化上述路由、DTO、分页、错误、preview 零写入、confirm 幂等、逐目标结果和 Markdown 只读语义；新 ApplicationProfile 写入不接受 legacy 覆盖字段。
- `agent-tools.md`：首期不新增写工具；未来 Agent 只能读取当次明确授权的 card/variant，不得写卡、选版、保存、同步、导出或编造事实。
- `browser-extension.md`：扩展只读选中档案的 resolved current version，不读素材库、迁移草稿或历史，不增加权限和自动提交能力。

## Implementation sequence

1. 完成契约、AC-01～AC-10 验收映射和 legacy fixtures。
2. 新增 Prisma 模型/迁移/GPA/current version 指针，验证空库与存量数据。
3. 实现素材 schemas、服务、API 和归属/不可变/归档测试。
4. 实现 composition schemas、纯 resolver、Unicode 字数和 legacy adapter。
5. 实现 legacy migration preview/confirm、sourceKey 去重和事件。
6. 实现简历/网申不可变版本保存、current pointer 和事件。
7. 实现 impact preview、diff、最多 50 目标的幂等批量同步。
8. 实现 Markdown provider/capabilities，切换 fill-context 并回归扩展。
9. 依次交付 `/materials`、`/resumes`、`/application-profile`。
10. 完成自动化、可访问性、响应式和验收证据。

## Risks and mitigations

- **旧契约冲突**：G1 明确 superseded/legacy-only 范围，不维护两个可写事实源。
- **多态 owner**：DocumentComposition 两个可空 owner FK 加数据库 check constraint，保证恰有一个 owner；服务再校验。
- **历史被污染**：保存时固定 variantId；resolver 不读“当前文案”；更新/归档测试断言旧输出稳定。
- **迁移误判/重复**：preview 只读、sourceKey 唯一、逐项确认；旧 JSON 永不回写。
- **批量竞态**：短期 preview token 绑定 current version；confirm 重检；逐目标事务和幂等键返回明细。
- **版本增长**：单批最多 50，列表分页并建立 user/card/current-version 索引；首期不清理历史。
- **字数歧义**：按 Unicode code point，返回 count/limit/overLimit，不截断。
- **导出草稿**：只接受持久化 versionId；provider 无写权限，测试断言数据库零变化。
- **隐私扩大**：扩展仍只读 resolved context，不获得 card/event/history API，不缓存内容。

## Verification strategy

### Automated

- 四份契约含 F-023 且无新增基础覆盖、follow-current 或历史原地更新路径。
- `pnpm db:generate`；空库迁移；legacy fixtures 迁移前后 JSON/content 相等。
- 新增 `pnpm test:materials`、`pnpm test:documents`；覆盖 CRUD/归档、variant 不可变、跨用户、resolver、Unicode、migration、version、sync 幂等和 Markdown 零写入。
- Web：`pnpm test:profiles`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。
- Extension：`pnpm test`、`pnpm build`。

### Manual acceptance

- 素材库：七类卡、variant、搜索/标签、归档；归档后不可新选但历史可读。
- 简历：选卡、排序、切 variant、隐藏基础字段、保存、重开旧版、导出；旧版不变。
- 网申：迁移 preview/confirm、插卡、Unicode 字数/超限、保存；legacy JSON 不变。
- 同步：preview 零写入；confirm 只创建选中目标新版本；重试不重复；跳过/失败原因明确。
- 1440/1024/768/390px 无页面级横向裁切；焦点可见，label/error 关联，拖拽有键盘替代和状态播报。

### Evidence and rollback

- 在 tasks 的 Verification record 回填日期、命令、结果和证据路径。
- 回滚只关闭新 UI/路由并保留新增表；不得删除已承载用户数据的表或回写 legacy JSON。
