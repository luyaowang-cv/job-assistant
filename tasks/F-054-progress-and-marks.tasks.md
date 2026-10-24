# F-054 Tasks

> 任务按依赖顺序排列。

- [x] T-001: `specs/contracts/browser-extension.md` 新增 F-054 段（三色语义与 `data-wl-fill-state`、清理时机、四个报告分组、着色不作用于已有内容与敏感字段）。 Verify: 覆盖 AC-1 ~ AC-5。
- [x] T-002: `form-page-bridge.js` 新增页面侧 `clearFieldMarks()` 与 `markFieldStates({ ok, manual, failed })`：只写 `outline`/`outlineOffset` 与 `data-wl-fill-state`，不碰 `background-color`/`class`/布局。 Verify: 源码级断言函数内联且不引用模块常量；只出现允许的属性名。
- [x] T-003: `main.ts` 在 `fillCurrentPage` 开始时清理上一轮标记，结束时按结果分三组上色（`filled`→绿、其余 `needs_manual`→橙、`unavailable`/未能确认→红），「已有内容」与「敏感字段」不着色。 Verify: AC-2、AC-4。
- [x] T-004: 进度文案 `正在填写 {done}/{total}：{label}`，本地阶段与 `flushFills` 各更新一次；取不到标签时省略字段名。 Verify: AC-1；加一条纯函数单测。
- [x] T-005: `renderFillReport` 按 `group` 分区渲染（写入失败 / 模型没答 / 未尝试 / 需手动确认），各分区计数并列字段名，四类之和等于 `needs_manual`。 Verify: AC-3；构造一份混合 entries 的单测。
- [x] T-006: 跑全量测试与北森 dump 回放，把结论回写 spec 的实施记录。 Verify: 139 条基线不退化；回放 `filled` 不下降。
