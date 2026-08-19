# F-028 Tasks: 自定义下拉 AI 填充放开（Dropdown AI Fill）

## 背景

扩展当前对部分自定义下拉是“硬不支持”：Universe Design（`.ud__select`）在扫描时被标记为不可编辑，既不进本地规则也不进 AI 流程；`applyChoiceEntries` 只匹配 `.el-select-dropdown__item, [role="option"]` 两类选项。目标改为：尽量让 AI 参与下拉填写，选项文本唯一精确匹配才点击，匹配不到留空人工处理；多选、日期、上传、敏感字段仍不自动处理。

> 说明：本文件仅为任务预留，spec / contracts / plan 在开始实现时按 SSD 流程补齐。

## 任务

- [ ] T-001: 调研 Universe Design（`.ud__select`）在目标站点的真实 DOM 结构（选项类名、下拉渲染时机、点击后是否需等待）。 Verify: 记录至少一个真实页面的选项 DOM 片段与渲染行为；若未提供站点 URL，标记为阻塞项
- [ ] T-002: `extension/lib/form-page-bridge.js` 扫描放开 `.ud__select`：`isEditable` 置为可编辑，与普通 `custom-select` 同一流程。 Verify: 扫描结果中 ud 下拉存在且 `isEditable=true`；Universe 不可点击的搜索/清除控件仍排除
- [ ] T-003: `applyChoiceEntries` 扩展选项选择器（如 `.ant-select-item-option`、Universe 选项类、`[class*="select-option"]`），保留“唯一精确匹配才点击 + 点击后校验输入值”的安全逻辑。 Verify: 匹配不到时标红留空，不误选；相关单测通过
- [ ] T-004: `extension/entrypoints/popup/main.ts` 确认放开后的 custom-select 全部进入 `/api/v1/form-fill/preview`（过滤条件微调）。 Verify: 日志/断点确认 ud 下拉字段进入 AI 请求
- [ ] T-005: 补充 `extension/lib/*.test.js` 单测：唯一精确匹配命中、多选项不选、无匹配留空、敏感/多选/已有值仍跳过。 Verify: `cd extension && pnpm test` 全部通过
- [ ] T-006: 构建扩展并真实页面冒烟：至少 1 个 Element Plus 下拉 + 1 个 Universe Design 下拉。 Verify: 命中选项变绿；未命中标红且保持留空
- [ ] T-007: 按 SSD 流程补齐 F-028 spec/contracts/plan，并记录执行结果与仍不可自动处理的控件类型。 Verify: 文档落库且验收标准可追溯

## 范围外（明确不做）

- 多选下拉、日期选择器、上传、富文本、远程搜索下拉（需输入才出选项）、密码/验证码/证件号等敏感字段。
- 自动点击展开后选项在 iframe 中渲染的控件。

## 阻塞项

- T-001/T-006 需要用户提供至少一个 Universe Design 实际站点 URL；在此之前实现只能基于通用选择器猜测。