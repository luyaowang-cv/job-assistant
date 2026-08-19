# F-006 Implementation Plan

## Architecture approach

新增 `PersonalProfile` 一对一归属 User，以 Zod 约束的 JSONB 保存 `basics` 与 `educations`。ApplicationProfile 保持既有字段以兼容历史数据，但其 `basics`/`educations` 从此表达可选覆盖；服务层提供纯合成函数，按 common → override 的优先级返回扩展和工作台可用的 resolved profile。

## Contract changes

- Domain: PersonalProfile is one-to-one per User; document type is allowed, document number is prohibited.
- API: GET/PUT `/api/v1/personal-profile`; ApplicationProfile results include resolved safe basics and educations, while update input remains override-only.
- Extension: only resolved safe profile fields may reach the local rule engine; sensitive-field blocklist remains authoritative.

## Implementation sequence

1. 建立 F-006 契约、任务与 Zod 输入边界。
2. 添加 Prisma 模型和非破坏性迁移，完成 PersonalProfile 服务及合成规则单测。
3. 提供个人资料 API，并让档案 API 返回合成后的内容。
4. 新增个人资料页面；为档案页添加继承提示、覆盖编辑与恢复继承操作。
5. 验证迁移、类型检查、API 合成结果和扩展构建。

## Risks and mitigations

- 历史档案：保留其已有 basics/educations 作为覆盖，绝不批量迁移或覆盖用户数据。
- 资料误填：仅合成数据，不扩大 F-005 的高置信字段白名单；证件号码始终不进入模型。
- 继承混乱：基础字段以单项覆盖表示，教育经历以整组覆盖表示；UI 明确标识“继承中”或“已覆盖”。

## Verification strategy

- 继承函数覆盖：无通用资料、通用值、单项覆盖、空覆盖、教育整组覆盖及既有档案。
- Zod 拒绝证件号码和未知字段。
- Prisma generate/migrate、web typecheck、extension test/build 均通过。
