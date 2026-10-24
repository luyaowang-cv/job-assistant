# F-051 Implementation Plan

## Architecture approach

**只在规则层加一道形状检查，不动写入层。** 形态不匹配应该在"决定填什么"的地方被拦下，因为只有那里知道档案里的原文是什么；写入层只能看到"页面拒绝了"，给不出"因为你的值是区间"这种解释。

新函数 `resolveNumericValue` 与现有的 `resolveOptionValue` 并列，同属"值 → 控件形态"这一层：都返回 `{ value }` 或 `{ error }`，调用点串在一起。

**「只有一个数字就取出来」是有意为之**：「20000元」对数字框是明确的答案；「20k-25k」不是。这条界限决定了什么时候帮用户一把、什么时候必须问。

**k 单位不换算。** 「20k」里只有一个数字 20，按当前规则会被写成 20——这是错的。因此把「数字紧跟 k/K/千/万」也判为需要人工确认，宁可多问一次。

## Contract changes

- `specs/contracts/browser-extension.md` 新增 F-051 段：数字控件的形状规则、`{ value } | { error }` 的返回约定、以及选项匹配四层顺序的现状确认。

## Implementation sequence

1. 契约：补 F-051 段。
2. `resolveNumericValue` + 在 pass 3 串进调用链。
3. 三条用例（区间拒绝、单数字取出、文本框不误伤）+ 一条 k 单位。
4. 回放与全量测试。

## Risks and mitigations

- **误伤文本框**：只在 `inputType === 'number'` 时启用，AC-2 专门守住。
- **k 单位**：按上面的规则判为人工确认，不猜。
- **规则层新增一道返回 error 的路径**：可能与 `noAnswer`、选项 error 的先后顺序冲突；调用顺序保持"选项 → 数字"，因为选项匹配失败时数字检查没有意义。

## Verification strategy

- 单位用例：区间拒绝 / 单数字取出 / 文本框原样 / k 单位拒绝。
- 回归：148 条基线全绿；北森 dump 回放 `filled` 不下降。
- 真机：在一个「期望月薪（元）」是数字框的页面上，确认报告写的是"只接受一个数字"而不是"写入失败"。
