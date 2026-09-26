# F-033: 网申档案到岗时间说明

## Goal

修复网申档案策略保存失败，使“可立即到岗”等真实到岗说明与具体日期都能保存。

## User scenarios

- 用户在“可到岗日期”中填写 `2026-09-01` 并保存。
- 用户在同一字段中填写“可立即到岗”“一个月内到岗”等说明并保存。
- 输入不合法时，页面展示服务端返回的具体校验原因。

## In scope

- 将策略字段 `availableDate` 从严格日期改为可选到岗时间说明文本。
- 空字符串和 null 继续归一化为未填写。
- 更新字段名称、占位文案、API 契约与回归测试。

## Out of scope

- 不修改教育、项目、工作经历中的结构化日期校验。
- 不新增数据库字段或迁移。
- 不推断或自动改写用户填写的到岗说明。

## Acceptance criteria

- 题述 payload 中 `availableDate: "可立即到岗"` 通过 Zod 校验。
- `availableDate: "2026-09-01"` 继续通过校验。
- 空字符串与 null 被处理为未填写。
- 超过 80 字符的说明被拒绝。
- 保存失败时页面尽可能显示服务端首条校验说明。
- 定向测试、类型检查、构建和接口回归通过。

## Affected contracts

- `specs/contracts/api-conventions.md`
- `specs/contracts/domain-model.md`

## Risks and open questions

- 该字段变为用户原文说明，AI 填写时只能原样使用或按目标表单要求做格式转换，不得推断新的到岗承诺。
