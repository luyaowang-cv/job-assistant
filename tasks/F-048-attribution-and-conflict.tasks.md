# F-048 Tasks

> 任务按依赖顺序排列，一次只进行一项。T-004 的用例先于 T-005 写，用来确认修复前确实是失败的。

- [x] T-001: `specs/contracts/browser-extension.md` 新增 F-048 段（归属域定义与判定词、`SELF_CONTEXT_WORDS` 反例、「归属不符 → 留空 + 专门原因」、分差阈值与冲突字段不进 AI）；同步更新 F-047 总纲段中归属域的实现状态。 Verify: 契约覆盖 AC-1 ~ AC-6；与 F-034/F-012 段无冲突。
- [x] T-002: `extension/lib/form-fill-rules.js` 新增 `OTHER_PERSON_PATTERN`（多字词：父亲/母亲/家长/配偶/子女/家庭成员/家庭/紧急联系人/联系人/推荐人/证明人/介绍人/担保人/监护人/亲属/家人）与 `SELF_CONTEXT_WORDS`（住址/地址/籍贯/户口/户籍），实现 `inferAttribution(field)`；`RULES` 增加 `attribution` 字段（缺省 `self`，`basics.emergencyContact*` 三条为 `other`）。 Verify: 纯函数单测覆盖「父亲姓名 → other」「家庭住址 → self」「公司名称 → self」「紧急联系人电话 → other」四例。
- [x] T-003: `scoreRule` 在结构否决处增加归属不一致即返回 0；确认 `basics.emergencyContact*` 不再抢普通的「姓名」「手机号」框。 Verify: 「姓名」仍填本人、「紧急联系人姓名」填他人值，两者不交叉（AC-2）。
- [x] T-004: 在 `form-fill-rules.test.js` 先写 AC-1/AC-3/AC-5 用例（他人字段全空、顺序无关、原因文案），确认在 T-003 之前**失败**。 Verify: 用例在旧实现下失败并打印出实际被填的值，证明它锁住了行为而不是空转。
- [x] T-005: `buildFillPlan` 为归属不符的字段落专门原因（「这是他人信息，本人档案不提供」/「档案里没有该归属的值」），与「字段含义无法可靠确认」区分。 Verify: AC-5 通过；报告里两类原因能分别计数。
- [x] T-006: `bestRuleFor` 记录次优规则，分差 < `SCORE_MARGIN`(0.05) 时返回 `{ rule: null, conflict: [a, b] }`；`buildFillPlan` 落 `needs_manual` + `skipAi: true`，原因列出两条候选。 Verify: AC-4 通过；冲突字段不出现在送给 AI 的字段列表里。
- [x] T-007: 回放验证：北森 dump 与大易字段结构各跑一次，比对改动前后 `filled / needs_manual`；若转人工比例超过两成，下调 `SCORE_MARGIN` 至 0.03 后重跑。 Verify: `filled` 计数不低于改动前；`pnpm test` 124 条基线 + 新增用例全绿。**（回放与测试已完成；`pnpm build` 因沙箱内 `node_modules` 的 pnpm 符号链接断裂未能执行，需在本机跑。）**
- [ ] T-008: 真机验证：在大易 `resumeOperation` 页面跑一次「只填空白项」，确认家庭信息一节未被写入本人信息；把实测结果与遗留问题回写 spec 的验收段。 Verify: 页面上父亲/家长/推荐人相关字段全部为空；AC-1 ~ AC-6 逐条核对通过；spec 已回写。
