# F-054 Implementation Plan

## Architecture approach

**三件事都只读结果，不参与判断。** 进度、颜色、分区都是把已经算出来的 `entries` 换个呈现方式，任何一件都不应该反过来影响"填什么"。

**标记必须写在页面上。** popup 一经失焦就销毁，把状态留在 popup 里等于用户一回头就看不见。新增两个页面侧函数（会被 `chrome.scripting.executeScript` 序列化，因此不能引用模块级常量）：一个按 `{ ok, manual, failed }` 三组 id 上色，一个清空。只写 `outline` 与 `data-wl-fill-state`，避开 `background-color`——那个已经被写入过程中的 90ms 临时高亮占用。

**进度用字段表反查标签。** `flushFills` 手上只有 id，先用 `fields` 建 `id → label` 的映射。取不到标签时只显示 `正在填写 12/34`，不编一个名字。

**报告分区在构造 entries 时打标，渲染时分组。** 现在四类原因是在构造时逐条判断的（`unavailableIds` / `failedFieldIds` / `notAttemptedFieldIds` / 其余），信息本来就在，只是被拍平成一段文字。加一个 `group` 字段带着走，`renderFillReport` 按它分组即可，**不重新推断**。

## Contract changes

- `specs/contracts/browser-extension.md` 新增 F-054 段：三色的语义与 `data-wl-fill-state` 属性名、清理时机、报告四个分组的定义（含"四类之和等于 needs_manual"）。并注明着色不作用于「已有内容」与「敏感字段」。

## Implementation sequence

1. 契约：补 F-054 段。
2. `form-page-bridge.js` 新增 `markFieldStates` 与 `clearFieldMarks`。
3. `main.ts` 在填写开始前清理、结束后按结果上色。
4. 进度文案：本地阶段与 `flushFills` 各更新一次。
5. `renderFillReport` 按 `group` 分组渲染，保留总述一行。
6. 补测试与回放。

## Risks and mitigations

- **着色误伤**：只对本次涉及的字段上色；「已有内容」「敏感」不着色（AC-4）。
- **页面重排导致着色错位**：与回读同源；最坏是颜色标错位置，清理函数可复原，且不影响已写入的值。
- **`data-*` 残留**：清理函数在每轮开始调用；同时保留在报告里"清除标记"的入口（复用现有清理按钮的位置）。

## Verification strategy

- 源码级断言：页面侧函数内联、不引用模块常量；只写 `outline`/`data-*`。
- 单元：进度文案生成函数（取不到标签时省略字段名）。
- 回归：139 条全绿；北森 dump 回放不变。
- 真机：填写过程中看文案前进；结束后看三色；关掉 popup 再打开确认标记仍在；再点一次填写确认旧标记被清。
