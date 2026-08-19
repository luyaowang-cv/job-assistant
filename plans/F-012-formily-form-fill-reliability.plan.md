# F-012 Implementation Plan

## Architecture approach

保留按点击注入的扫描/填写模型。扫描器增加 Formily 表单项作为局部标签范围；填写器在事件派发后验证 DOM 当前值，避免把仅修改属性但未被框架接受的结果报告为成功。

## Contract changes

- 浏览器扩展契约增加 Formily 标签范围与写入后验证规则。

## Implementation sequence

1. 定义 Formily 标签/控件范围与失败报告标准。
2. 更新 page bridge 的扫描和写入逻辑。
3. 增加 Formily fixture 和规则测试。
4. 构建扩展并在目标官网人工验收。

## Risks and mitigations

- 网站 DOM 层级不同：仅用同一最近 Formily item 的短标签，不回退到整页文字。
- 受控组件覆盖输入：写入后验证值并报告失败，不伪造已填写。

## Verification strategy

- 规则测试验证 Formily 标签产生姓名/邮箱/手机号本地计划。
- fixture 验证扫描标签、输入事件和写入后结果。
- 扩展 build 与真实官网手工验证。
