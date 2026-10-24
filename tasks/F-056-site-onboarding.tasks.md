# F-056 Tasks

- [x] T-001: `specs/contracts/browser-extension.md` 新增 F-056 段（夹具位置与格式、测试发现规则、期望手写的约束）。 Verify: 覆盖 AC-1 ~ AC-4。
- [x] T-002: 手写北森夹具 `beisen-zhiye-camzhaopin.expect.json`，7 条覆盖"必须填对 / 必须不填 / 容易认错"。 Verify: 每条都能说出"这家站点为什么必须这样"。
- [x] T-003: `extension/lib/site-fixtures.test.js` 自动发现 `*.expect.json` 并断言 key / status / value；包含"至少有一份夹具"的兜底断言。 Verify: AC-1、AC-2。
- [x] T-004: 反向验证：改错一条期望，确认测试失败并打印期望与实际；还原。 Verify: 失败信息可定位到具体字段与 reason。
- [x] T-005: 写 `docs/extension-site-onboarding.md`（五步流程、时间预算、何时改代码 vs 加别名、已覆盖站点表）。 Verify: 按文档能从零完成一次适配。
- [x] T-006: 跑全量测试与北森 dump 回放，结论回写 spec。 Verify: 159 条全绿；回放不变。
