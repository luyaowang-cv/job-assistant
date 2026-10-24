# F-053 Tasks

> 调查后本条功能点不含行为改动，只交付验证与契约。

- [x] T-001: `specs/contracts/browser-extension.md` 新增 F-053 段（写入器有序性、批次内/批次间与跨类型边界、不变量靠测试锁住）。 Verify: 覆盖 AC-1 ~ AC-4。
- [x] T-002: 补源码级断言：`applyFillEntries` 遍历 `controls`、`applyChoiceEntries` 遍历 `allControls`，两者都用 `byId.get(...)` 查答案而不是遍历答案列表。 Verify: 断言通过。
- [x] T-003: 反向验证：临时把 `applyChoiceEntries` 主循环改成 `for (const entry of entries)`，确认断言失败，然后还原。 Verify: 失败信息指出遍历源错误；还原后全绿。
- [x] T-004: 跑全量测试与北森 dump 回放，把结论回写 spec 的实施记录。 Verify: 138 条基线不退化；回放 `filled` 不下降。
