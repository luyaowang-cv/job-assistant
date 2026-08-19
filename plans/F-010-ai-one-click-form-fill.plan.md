# F-010 Implementation Plan

## Architecture approach

popup 在点击时扫描无值 descriptors，提交给本地工作台的 AI 映射 API。服务端按 profileId 加载已合成档案，使用 F-009 的 OpenAI 兼容设置与环境变量 Key 调用模型，并用 Zod 过滤结果。popup 将允许的建议注入当前 tab，页面侧再次确认空值并设置绿/红高亮。

## Contract changes

- 新增不持久化的 `/api/v1/form-fill/preview`，输入 profileId 和受限 descriptors，输出 fieldId/value 建议和 unresolvedIds。
- extension 不再只依赖本地白名单；普通非敏感字段可进入 AI 映射，但安全排除、已有值不覆盖和不提交不变。

## Implementation sequence

1. 定义 F-010 API/扩展/Agent 契约和 Zod schema。
2. 实现服务端档案读取、OpenAI 兼容调用与输出过滤。
3. 改造 popup 与页面 bridge，实现一键 AI 填写和绿/红高亮。
4. 添加 schema/本地规则测试、构建和手工验收。

## Risks and mitigations

- 模型输出不合规：严格 Zod 解析、过滤未知 id 和空答案。
- 误填：不覆盖已有值，保持高亮让用户复核，不自动提交。
- 模型不可用：返回清晰错误，不重试、不使用隐蔽后备请求。

## Verification strategy

- 测试 API schema 的敏感字段/未知字段拒绝与模型输出过滤。
- 使用 fixture 验证绿/红样式与已有/敏感控件不变。
- 构建扩展、类型检查；配置 Key 后由用户在真实官网验证。
