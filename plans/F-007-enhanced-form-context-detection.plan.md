# F-007 Implementation Plan

## Architecture approach

扩展继续只在 popup 明确点击后通过 `chrome.scripting.executeScript` 运行扫描函数。扫描函数为每个可见控件建立无值 descriptor，并按标准关联标签、ARIA、框架表单项标签、同一表格行/相邻元素的顺序选择简短标签；规则模块只消费规范化后的标签和既有安全元数据。它会由完整出生日期本地计算年龄，并仅为原生单选 `select` 制定唯一精确选项的填写计划。

## Contract changes

- 记录字段标签的来源和优先级，允许由受限的框架表单项/相邻标签产生标签。
- 不扩大权限、不新增持久脚本，也不传递页面现有值；`select` 只传递候选显示文本，页面侧重新确认唯一匹配选项后赋值并派发事件。

## Implementation sequence

1. 补充 F-007 规则和浏览器扩展契约。
2. 改进页面侧标签提取与标签规范化。
3. 为本地规则和 fixture 添加组件式表单、年龄和原生下拉精确匹配场景。
4. 执行测试、构建，并由用户复测真实官网。

## Risks and mitigations

- 容器文本误判：限制标签长度、优先结构化 label 元素，并禁止以整块容器文字直接匹配。
- 动态控件：继续在填写前重新验证元素可用且为空；无法识别时不填写。

## Verification strategy

- 运行 extension 单测和 WXT build。
- 使用本地 fixture 验证 Element Plus/Ant Design 风格容器。
- 用户在原目标官网确认未命名字段减少，且敏感、已有值和选项字段报告仍正确。
