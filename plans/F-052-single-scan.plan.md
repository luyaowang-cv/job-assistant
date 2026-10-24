# F-052 Implementation Plan

## Architecture approach

**用"写了什么"回答"填了什么"，不再用"再扫一遍"反推。** 写入函数 `applyEveryFrame` 已经返回 `appliedIds`——那是逐字段写后回读确认过的结果，比事后猜准。第二遍扫描存在的唯一理由是"想知道现在哪些框有值"，而这件事 `collectControlValues` 一次轻量注入就能答。

**回读只做一件事：确认值还在。** 它不重算标签、不推断段落、不重建计划。`appliedIds` 与回读结果的交集算"已填写"，差集算"未能确认"。交给模型的字段改成"回读里没有值"——这样页面上本来就有的内容、以及我们刚写进去的内容，都不会被再问一次。

**报告用第一遍的计划。** 现在报告用第二遍重建计划，导致同一字段在两次计划里的状态可能不同（例如本地写入后第二遍看到 `hasValue` 为真）。改用第一遍计划 + `appliedIds` 覆盖状态，语义更直白：一个字段的状态取决于"我们做了什么"，而不是"页面事后长什么样"。

**删掉签名计数。** `fieldSignature` 那套是为了跨两次扫描对齐字段而存在的，第二遍扫描没了它就没有意义。留着会让"C 类逻辑并存"，将来维护时更难判断哪条生效。

## Contract changes

- `specs/contracts/browser-extension.md` 新增 F-052 段：`appliedIds ∩ 回读` 的判定约定、"未能确认"的语义、报告基于第一遍计划、签名计数已移除。

## Implementation sequence

1. 契约：补 F-052 段。
2. `main.ts` 新增 `readControlValuesEveryFrame`。
3. 替换第二遍扫描/重建计划那一段：`liveValues`、`activeLocalAppliedIds`、`unconfirmedIds`。
4. `aiFields` 改为按 `liveValues` 过滤。
5. 删除 `fieldSignature` 与 `appliedSignatureCounts`。
6. 报告改用 `localPlan.entries`。
7. 补 AC-1 源码级断言与 AC-3 用例。

## Risks and mitigations

- **id 对齐**：`collectControlValues` 与 `scanVisibleFormFields` 共用同一 `CONTROL_SELECTOR` 与遍历顺序，且索引在过滤前分配。改动时若动了任一侧的选择器，必须同步——契约里已把这条列为不变量。
- **页面重排导致回读错位**：最坏结果是"未能确认"，不会虚报成功；F-054 的三色标记会把这类字段标红。
- **删掉签名计数后行为变化**：AC-2 用报告计数比对兜底；回放北森 dump 再兜一层。

## Verification strategy

- 源码级断言：`fillCurrentPage` 内 `scanEveryFrame(` 只出现一次。
- 单元：`readControlValuesEveryFrame` 的 id 限定（多帧不串）；未能确认的分支。
- 回归：136 条全绿；北森 dump 回放计数不变。
- 真机：同页面填写两次，报告计数与改动前一致；用页面上的 30+ 字段观察本地阶段是否明显更快（以不再有第二遍扫描为准）。
