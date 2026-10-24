# F-051 Tasks

- [x] T-001: `specs/contracts/browser-extension.md` 新增 F-051 段（数字控件形状规则、`{ value } | { error }` 约定、选项匹配四层顺序的现状确认）。 Verify: 覆盖 AC-1 ~ AC-4。
- [x] T-002: 新增 `resolveNumericValue` 并在 pass 3 串在 `resolveOptionValue` 之后。 Verify: 区间值不被写入数字框；文本框行为不变。
- [x] T-003: 补四条用例：区间拒绝、单数字取出、"k/千/万"单位拒绝、文本框原样。 Verify: 四条全绿；AC-1 ~ AC-3 通过。
- [x] T-004: 跑全量测试与北森 dump 回放，结论回写 spec。 Verify: 148 条基线不退化；回放 `filled` 不下降。
