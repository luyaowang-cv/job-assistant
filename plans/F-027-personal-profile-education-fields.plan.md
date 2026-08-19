# F-027 Implementation Plan

## Architecture approach

- 仅扩展个人档案 `educationSchema` 与页面表单；数据仍为 JSONB 主记录，无需迁移。
- ApplicationProfile 旧覆盖 schema 与 A4 渲染保持原样（只读透传，不受新增字段影响）。

## Contract changes

- `domain-model.md`：新增 `college` / `lab` / `researchDirection` / `advisor` 可选字段说明。

## Implementation sequence

1. `educationSchema` 扩展。
2. 页面类型、emptyEducation 与输入框扩展。
3. schema 测试。
4. 验证 gate（test / lint / typecheck / build）。

## Risks and mitigations

- `.strict()` 必须同步扩展字段，否则 API 拒绝新字段；用 schema 测试覆盖。

## Verification strategy

- `pnpm test:personal-profile`、`pnpm test:profiles`（回归）
- eslint 改动文件
- `pnpm typecheck`、`pnpm build`