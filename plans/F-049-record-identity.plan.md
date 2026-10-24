# F-049 Implementation Plan

## Architecture approach

**把"数锚点"这一步提前到结构层，与"决定填不填"解耦。** 现在 `buildFillPlan` 是单循环：每遇到一个字段就判状态，`hasValue` / 敏感 / 冲突在三处 `continue` 掉了，只有走到最后的字段才会进入 `candidates`，而 `assignRecordIndices(candidates)` 只看到这批。改成两段式：

1. **每个字段都算一次 `bestRuleFor`**，把 `{ field, rule, datePart }` 全部塞进 `structureCandidates`——不看它待不待填。这一步只依赖标签与上下文，与状态无关。
2. `assignRecordIndices(structureCandidates)` 在这个全集上编号。
3. 第三段取值时仍按字段自己的状态走，`decisions` 里已经定过的直接返回，只有真正要填的字段才去 `resolveRecordIndex`。

这样"第几段"由页面结构决定，"填不填"由字段状态决定，两件事不再互相影响。改动集中在 `buildFillPlan` 的循环顺序，`assignRecordIndices` 与 `resolveRecordIndex` 本身不用动。

**每个字段的 `bestRuleFor` 只算一次。** 现在 `classifyField(field)` 内部会算一次，循环里又算一次；改成循环里算一次然后复用（`classifyField` 接受可选的外部 match），避免同一字段在一轮里跑两遍打分表——这既是正确性（两处口径必须一致），也是 F-052 提速的前置。

**稳定身份不在这里做。** 原计划把"给控件打 `data-*` 跨扫描复用"放在本功能点，核对代码后改到 F-052：`main.ts` 那套签名计数是为了"填写后再全量扫描一次"服务的，而 F-052 会把那一步删掉、直接使用写入函数返回的 `appliedIds`。在即将被删除的路径上做加固是浪费。本功能点只在 spec 里记下这个调整。

## Contract changes

- `specs/contracts/browser-extension.md` 新增 **F-049** 段：记录编号以"全部扫描字段"为输入、三种编号口径（锚点/再次出现/日期分片再次出现）、块数多于档案时的报告约定；并说明稳定身份改由 F-052 处理。
- 更新 F-047 总纲段中 F-049 的交付物一行（去掉"稳定身份"）。

## Implementation sequence

1. 契约：补 `browser-extension.md` 的 F-049 段。
2. 先写 AC-1 用例（第一段已填、第二段空），确认在当前实现下**失败**。
3. 改 `buildFillPlan`：循环内先算 match 并收集 `structureCandidates`，循环后统一 `assignRecordIndices`。
4. `classifyField` 支持复用外部 match，消除同一字段的重复打分。
5. 补 AC-2 ~ AC-5 用例。
6. 回放北森 dump，确认 `filled` 不下降。

## Risks and mitigations

- **已填字段参与编号后，编号可能"跳号"**：例如第 2 段整段已填，第 3 段空——编号应为 2，不是 0。这正是修复目标，AC-1 会锁住。
- **无锚点页面的兜底口径依赖页面顺序**：不改变现状，只在报告里如实说明。
- **敏感字段纳入编号**：AC-5 专门验证它不改变锚点计数。
- **两处 `bestRuleFor` 口径不一致**：合并成一次调用后自然消失；合并时保留 `classifyField` 的公开签名，避免影响既有调用方与测试。

## Verification strategy

- 单元测试：AC-1 ~ AC-5 各一条；AC-1 必须在改代码前失败。
- 回归：现有 131 条全绿。
- 回放：北森 dump `filled` 计数不低于改动前。
- 真机：在有两段及以上经历的网申页面跑一次，核对第二段的公司/职位/起止时间与档案第二条一致。
