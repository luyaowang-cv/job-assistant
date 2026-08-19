# F-027: 个人档案教育背景字段扩展

## Goal

在个人档案“教育背景”中新增可选字段：学院（college）、实验室（lab）、领域方向（researchDirection）、导师（advisor）；“学历类型”与“专业”沿用既有 `educationLevel` / `major` 字段并明确 UI 标签。

## User scenarios

1. 用户在个人档案教育经历中填写学院、实验室、领域方向与导师信息并保存。
2. 已保存档案无需迁移，旧记录与新字段并存。

## In scope

- `personal-profile` 的 `educationSchema` 新增 4 个可选字段并保持 `.strict()`。
- 个人档案页面教育背景表单新增对应输入框，学历字段标签明确为“学历类型”。
- schema 测试与验证（test / lint / typecheck / build）。

## Out of scope

- ApplicationProfile 旧覆盖 schema、A4 简历渲染展示、表单填充上下文展示新字段。
- 必填校验、枚举约束（学历类型/领域方向均保持自由文本）。
- 历史数据迁移。

## Acceptance criteria

- AC1 `educationSchema` 接受 `college` / `lab` / `researchDirection` / `advisor` 可选字符串，拒绝未知字段。
- AC2 页面表单可填写并保存 4 个新字段；保存后 GET 返回相同值。
- AC3 空字符串不持久化（沿用现有 cleanEntry 行为）。
- AC4 既有字段与测试不受影响；test / lint / typecheck / build 通过。

## Affected contracts

- `specs/contracts/domain-model.md`：PersonalProfile.educations 字段清单扩展。

## Risks and open questions

- 字段全部可选、自由文本，无兼容风险；JSONB 存储无需迁移。
- 是否在 A4 简历中展示学院/实验室/导师：本次不做，另行评估。