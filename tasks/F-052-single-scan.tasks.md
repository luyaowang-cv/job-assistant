# F-052 Tasks

> 任务按依赖顺序排列。

- [x] T-001: `specs/contracts/browser-extension.md` 新增 F-052 段（`appliedIds ∩ 回读` 判定、未能确认的语义、报告基于第一遍计划、签名计数已移除）。 Verify: 覆盖 AC-1 ~ AC-5；与 F-049 段无冲突。
- [x] T-002: `main.ts` 新增 `readControlValuesEveryFrame(tabId)`：注入 `collectControlValues`、按帧限定 id、返回 `Map<string, string>`。 Verify: 多帧时 id 不串；单测覆盖限定逻辑。
- [x] T-003: 删除 `fillCurrentPage` 里的第二遍 `scanEveryFrame` 与第二次 `buildFillPlan`；改为 `liveValues` + `appliedIds ∩ 回读` 判定已填写，差集记「未能确认」。 Verify: 报告计数与改动前一致（AC-2）；未能确认的字段状态不是 filled（AC-3）。
- [x] T-004: `aiFields` 改为按 `liveValues` 过滤（回读里没有值才问模型），并保留原有的敏感/冲突/不可编辑等排除条件。 Verify: 页面预填字段与刚写进去的字段都不进 AI 列表。
- [x] T-005: 删除 `fieldSignature` 与 `appliedSignatureCounts`（实际只删后者——前者仍被答案记忆使用），报告改用第一遍计划 `localPlan.entries`。 Verify: 无残留引用；`pnpm test` 全绿。
- [x] T-006: 源码级断言：`fillCurrentPage` 内 `scanEveryFrame(` 只出现一次。 Verify: 该断言在改动前失败、改动后通过。
- [x] T-007: 跑全量测试与北森 dump 回放，把实测结果回写 spec 的验收段。 Verify: 136 条基线不退化；回放 `filled` 不下降。
