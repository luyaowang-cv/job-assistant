# F-048 Implementation Plan

## Architecture approach

**归属是规则的一个属性，不是又一条 `if`。** `RULES` 里每条加 `attribution`（缺省 `self`，目前只有 `basics.emergencyContact*` 三条是 `other`）；字段侧用 `inferAttribution(field)` 从描述符里推。两者不一致时在 `scoreRule` 的最前面返回 0——位置与现有的 `isControlCompatible`、`isDescriptorCompatible` 并列，因为它是同一层的**结构性否决**，不是加分项。

**判定词取多字，且带一个反例清单。** 单字（父/母/子/女）会误伤公司名与项目名（「子公司」「母公司」），所以只用两字以上词。同时维护 `SELF_CONTEXT_WORDS`：`住址|地址|籍贯|户口|户籍` 出现时**不触发**他人归属——「家庭住址」是本人的，「家庭成员电话」不是。这条反例是本次最容易出事的地方，必须单独写测试。

**他人的空值要能解释。** 现在所有"没填上"都可能是同一句「字段含义无法可靠确认」。归属不符的字段需要在 `buildFillPlan` 里落一条专门的原因，否则用户（和未来的我们）无法把它与"规则没认出来"区分开。

**分差闸门放在 `bestRuleFor`，但回报要带上两条候选。** 现在它只返回 `{ rule, score }`；改为同时记录次优，分差小于 `SCORE_MARGIN` 时返回 `{ rule: null, conflict: [a, b] }`。`buildFillPlan` 把冲突字段落成 `needs_manual` + `skipAi: true`，原因是两条规则名。**冲突字段不交给模型**——模型看到的也是同一个模糊标签，只会更自信地猜错。

**分差只在"猜错代价明确"的地方生效。** 现有规则里大量字段靠 `types`、`controlType`、`multiline` 等加成拉开差距；如果对所有字段都套同一阈值，可能把本来明确的字段推进人工。因此：**只对同分值或分差 < 0.05 的候选报冲突**，并且用真实 dump 回放检验转人工比例，超两成就下调到 0.03。

## Contract changes

- `specs/contracts/browser-extension.md` 新增 **F-048** 段：① 归属域的定义与判定词（含 `SELF_CONTEXT_WORDS` 反例）；② "归属不符 → 留空 + 专门原因"的约定；③ 分差阈值与"冲突字段不进入 AI"的约定。
- 同时更新 F-047 总纲段里"归属域"一行的实现状态标记（从"计划"改为"已实现"）。

## Implementation sequence

1. 契约：补 `browser-extension.md` 的 F-048 段。
2. 规则表：`RULES` 加 `attribution`；新增 `OTHER_PERSON_PATTERN`、`SELF_CONTEXT_WORDS`、`inferAttribution`；`scoreRule` 增加归属否决。
3. 原因文案：`buildFillPlan` 里区分"归属不符"与"规则未识别"。
4. 测试：AC-1 ~ AC-3、AC-5 四条用例（先写，确认在改代码前失败）。
5. 分差：`bestRuleFor` 记录次优并返回冲突；`buildFillPlan` 落 `needs_manual` + `skipAi`；AC-4 用例。
6. 回放：北森 dump + 本次大易字段结构各跑一次，比对 `filled / needs_manual` 计数。

## Risks and mitigations

- **把「家庭住址」判成他人**：反例清单优先于他人标记词，且单独写测试。
- **「联系人」误伤本人**：一律留空，属可接受的漏填；真遇到站点需要，按站点补例外并记入契约。
- **分差闸门让大批字段转人工**：回放统计转人工比例；超两成下调阈值或只在 `basics.*` 上启用。
- **去重逻辑与归属重叠**：现有的「同一栏目已占用」去重保留不动——它挡的是"同一个值填进两个同类框"，与归属是两个维度，去掉会丢一层保护。
- **既有 124 条测试被归属层打破**：这些测试大多用标准标签（姓名/学校/公司），理论上不受影响；若有用例故意用他人标签断言"填上"，说明该用例记录的正是要修的行为，需在其注释里说明后调整。

## Verification strategy

- 单元测试：AC-1 ~ AC-5 各一条 `node:test` 用例；「家庭住址不被误判」单独一条。
- 顺序无关：同一组字段正反两种顺序各跑一次，结论必须一致（AC-3）。
- 回放：`docs/diagnosis-scripts/dumps/beisen-zhiye-camzhaopin.json` + 大易导出结构，比对 `filled` 计数不下降。
- 真机：在大易页面上跑一次「只填空白项」，确认家庭信息一节没有被写入。
- 质量门：`pnpm test` 124 条基线全绿 + 新增用例全绿；`pnpm build` 通过。
