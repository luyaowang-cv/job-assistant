# F-056 Implementation Plan

## Architecture approach

**夹具是数据，测试是发现器。** 测试扫描 `docs/diagnosis-scripts/dumps/*.expect.json`，配对同名的 dump 与 profile，逐条断言。加一家站点 = 加一个 JSON 文件，不动一行测试代码——这是"30 分钟适配"里唯一能省下来的部分。

**期望手写，不自动生成。** 这是整套夹具的意义所在：从当前输出倒推出来的期望，在规则改坏时会跟着一起改，测试永远是绿的。因此文档把这条写成硬规则，spec 的 AC-3 也要求每条写明理由。

**只断言三条：栏目（`key`）、状态（`status`）、值（`value`）。** 不比对整份报告的计数——计数会随规则改进合法地变化（F-050 让更多字段可填），把它写进夹具会让每次改进都要改夹具。

## Contract changes

- `specs/contracts/browser-extension.md` 新增 F-056 段：夹具文件的位置与格式、测试的发现规则、期望手写的约束。

## Implementation sequence

1. 契约：补 F-056 段。
2. 写首份夹具 `beisen-zhiye-camzhaopin.expect.json`（手写 7 条）。
3. 写 `extension/lib/site-fixtures.test.js`（自动发现 + 三元断言）。
4. 反向验证：改错一条期望，确认测试失败并指出期望与实际；还原。
5. 写 `docs/extension-site-onboarding.md`（五步 + 时间预算 + 何时改代码）。
6. 全量测试与回放。

## Risks and mitigations

- **夹具腐化**：文档要求适配时同步更新 dump；夹具只承诺"在这个结构下规则是对的"。
- **期望过宽**：文档建议至少一半条目写 `key` + `value`；首份夹具 7 条里有 5 条带值。
- **测试发现机制依赖于目录**：路径从 `lib/` 上溯两级，若目录搬迁会静默发现不到夹具——用"至少有一份夹具"的断言兜底。

## Verification strategy

- 反向验证：把一条期望的 `key` 改错，确认测试失败并打印实际值。
- 回归：157 条基线 + 2 条夹具测试 = 159 全绿。
- 人工：按文档从零走一遍"导出 → 写期望 → 跑"，记录耗时是否在 30 分钟以内（首份夹具本身即样本，但真机导出耗时需用户验证）。
