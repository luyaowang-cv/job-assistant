# F-053 Implementation Plan

## Architecture approach

**调查推翻了假设，所以这一条只交付验证与文档。** 总纲把"选择类控件按到达顺序写"列为待修问题，核对后不成立：`applyChoiceEntries` 与 `applyFillEntries` 都是"遍历控件、按 id 查答案"的写法，传入顺序不影响落位顺序。

因此不再往写入层加排序（那是给不存在的问题加代码）。真正有价值的是把这个不变量写成测试——一旦有人把主循环改成 `for (const entry of entries)`，写入顺序会静默退化，而这种退化在视觉上很难发现（90ms 高亮掩盖了跨类型并行）。

仓库已有同类手法：页面侧函数无法在 node 里跑真实 DOM，`form-fill-rules.test.js` 里用 `fn.toString()` 做源码级断言（控件选择器三处一致、id 拼写一致、shadow root 遍历）。本功能点沿用同一手法。

## Contract changes

- `specs/contracts/browser-extension.md` 新增 F-053 段：两条写入器的有序性、批次内/批次间与跨类型的边界、以及"不变量靠测试锁住"的说明。

## Implementation sequence

1. 契约：补 F-053 段。
2. 补源码级断言（AC-1）。
3. 反向验证：临时把 `applyChoiceEntries` 的主循环改成遍历 `entries`，确认断言失败后还原（AC-2）。
4. 跑全量测试与回放，回写 spec。

## Risks and mitigations

- **断言过于依赖字面量**：匹配 `for (const { element, index } of controls)` 这类具体写法，重构时容易误报。缓解：断言用"遍历源是控件集合"与"存在 byId 查表"两条特征，而不是整行字面量。
- **文档与代码再次脱节**：本次的教训是"总纲里的判断也可能错"。缓解：结论写进 spec 的实施记录，注明检查方式（读函数体、确认遍历源）。

## Verification strategy

- 源码级断言 + 反向验证（改坏 → 断言失败 → 还原）。
- 回归：138 条全绿；北森 dump 回放计数不变。
- 真机：不需要——本次不改行为。
