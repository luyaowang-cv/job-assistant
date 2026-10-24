# F-049 Tasks

> 任务按依赖顺序排列。T-003 的用例先于 T-004 写，用来确认修复前确实是失败的。

- [x] T-001: `specs/contracts/browser-extension.md` 新增 F-049 段（记录编号以全部扫描字段为输入、三种编号口径、块数多于档案的报告约定、稳定身份改由 F-052 处理）；更新 F-047 总纲段中 F-049 的交付物一行。 Verify: 契约覆盖 AC-1 ~ AC-6；与 F-048 段无冲突。
- [x] T-002: `buildFillPlan` 的循环改为先算 `bestRuleFor` 并把每个字段收进 `structureCandidates`（不看状态），循环结束后统一 `assignRecordIndices`；第三段取值逻辑不变。 Verify: 现有 131 条测试全绿，无行为回归。
- [x] T-003: 先写 AC-1 用例：两段实习、第一段 `hasValue: true`、第二段空，断言第二段取第 2 条记录。 Verify: 在 T-002 之前该用例**失败**，并打印出实际取到的值（证明它锁住的是真问题）。
- [x] T-004: 补 AC-2（两段都空按顺序取第 1、2 条）、AC-3（三段对两段时第三段报"档案中没有第 3 条对应记录"）、AC-4（年/月分片同属一条记录）、AC-5（区块内的他人/敏感字段不改变编号）。 Verify: 五条用例全绿。
- [x] T-005: `classifyField` 支持复用外部传入的 match，消除同一字段在一轮内的重复打分。 Verify: 公开签名兼容；既有测试全绿。
- [x] T-006: 回放北森 dump，确认 `filled` 不低于改动前；把实测结果回写 spec 的验收段。 Verify: `pnpm test` 全绿；回放计数无回归；spec 已回写。
