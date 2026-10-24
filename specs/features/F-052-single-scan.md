# F-052: 一次扫描与增量回读

> 属于 F-047 总纲的 P0 功能点。目标 G3：本地阶段 ≤ 1 秒。

## Goal

一次填写现在要**扫两遍页面**：第一遍建计划，本地写完后**再全量扫描一遍**、**再建一次计划**，然后用「标签签名计数」把两次扫描的结果对起来，才知道"哪些框是刚填的"。

第二遍扫描只回答一个问题：**这个框现在有值吗**。而这个问题用一次轻量回读就能回答——桥接层已经有 `collectControlValues`，它读值但不重算标签、不推断段落。更关键的是，写入函数本来就会返回 `appliedIds`，连"哪个框写了"都已经是已知的。

这一遍全页扫描 + 一次完整规则匹配，是纯重复劳动。

## User scenarios

- 用户点「填写」，30–40 个字段的页面上，本地规则的答案在 1 秒内全部落位（不含模型等待）。
- 页面上有两个同名同结构的框时，报告里"已填写/已保留"的归属不会张冠李戴。
- 某个框写进去后被页面框架还原了，报告写"写入后回读不到内容"，而不是当作成功。

## In scope

- 新增 `readControlValuesEveryFrame(tabId)`：注入 `collectControlValues`，按帧限定 id，返回 `Map<fieldId, value>`。
- `fillCurrentPage` 删掉第二遍 `scanEveryFrame` 与第二次 `buildFillPlan`；判断"是否已填"改为 `appliedIds ∩ 回读有值`，"要不要交给 AI"改为"回读里没有值"。
- 写入成功但回读不到的字段：记为「未能确认」，并在报告里说明，不计入已填写。
- 报告的 `entries` 改用第一遍的计划，不再用第二遍重建的计划。

## Out of scope

- 流式写入的批次策略、并发（属 F-053）。
- 自定义控件的写入细节（属 F-050）。
- 页面在填写期间新增了字段的极端情况：本次不重新扫描，新增的框不会出现在报告里。

## 验收标准

- AC-1：一次填写流程中 `scanVisibleFormFields` 只被调用一轮（源码级断言：`fillCurrentPage` 内 `scanEveryFrame(` 出现一次）。
- AC-2：同一页面同一档案，改动前后的报告计数（已填/已保留/需人工）一致或更好。
- AC-3：写入返回 `appliedIds` 但回读没有值的字段，状态不是"已填写"，报告给出「未能确认」的原因。
- AC-4：现有 136 条测试全绿；北森 dump 回放 `filled` 不下降。
- AC-5：本地阶段（点击 → 本地答案全部落位）的耗时不再包含一整轮标签计算；以代码路径为准（不再调用 `scanEveryFrame`），不以秒表为唯一证据。

## Risks and open questions

- **回读与扫描的索引是否对齐**：两者共用同一个 `CONTROL_SELECTOR` 与同一套 open shadow root 遍历，`form-field-N` 是同一控件。这一条本身就是不变量，AC-1 的源码断言之外再加一条注释说明。
- **写入后页面重排**：回读按位置 id 匹配，重排会让 id 指向别的控件。缓解：`collectControlValues` 与扫描同源同序，且本地写入是逐帧一次完成的，中间不触发重排；真出现重排时，最坏结果是"未能确认"，不会误报成功。
- **废弃的签名计数逻辑**：`fieldSignature` 与 `appliedSignatureCounts` 一并删除还是保留？保留会造成"两套判断并存"，故删除；若将来需要，再从 git 历史取回。

## 实施记录（2026-10-19）

**改动**：`fillCurrentPage` 删掉第二遍 `scanEveryFrame` 与第二次 `buildFillPlan`；新增 `readControlValuesEveryFrame`；"已填写"改由 `appliedIds ∩ 回读` 判定，差集记「未能确认」；`aiFields` 改为"回读里没有值"；两处报告改用第一遍计划 + `reportEntry` 覆盖状态。`appliedSignatureCounts` 删除。

**一处与原计划的偏差**：原计划写"`fieldSignature` 与 `appliedSignatureCounts` 一并删除"，实际 `fieldSignature` 仍被开放题的答案记忆使用（`planRememberedAnswers` 用它记录签名），只删了 `appliedSignatureCounts`。

**验收**：源码级断言（`fillCurrentPage` 内 `scanEveryFrame(` 与 `buildFillPlan(` 各恰好一次）已用"临时插回第二遍扫描"反向验证过——插入后断言立即失败并报出 2 次，还原后通过。测试 136 → **138 全绿**。北森 dump 回放 `filled 5 / skipped_existing 11 / needs_manual 21 / 送模型 3`，与改动前一致。

**id 对齐**：`collectControlValues` 除普通控件外也记录 `radio-group-N` 与 `custom-select-N`，与扫描器的编号规则一致，因此单选组与自定义下拉的"是否已填"同样能被回读判断，不会因为不在 `values` 里而被误送去模型。

**未完成**：`pnpm build` 与本机真机验证（沙箱内 `node_modules` 符号链接断裂）。真机上还需要观察一点：页面若在填写期间重排，回读可能对不上，最坏结果是「未能确认」而不是虚报成功——F-054 的三色标记会把这类字段标出来。
