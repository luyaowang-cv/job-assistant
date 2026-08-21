# F-033 Implementation Plan

## Architecture approach

保持 ApplicationProfile.strategy JSON 数据结构不变，仅将 Zod 的 `availableDate` 校验器替换为最大 80 字符的可选说明文本，并保留空值预处理。前端同步将字段文案改为“可到岗时间”。

## Contract changes

- `availableDate` 接受具体日期或自然语言到岗说明。
- 经 trim 后的空字符串和 null 视为未填写。

## Implementation sequence

1. 更新规格与契约。
2. 修改 Zod schema 和前端字段文案。
3. 补充题述 payload 与边界测试。
4. 运行验证、构建生产产物并重启守护服务。

## Risks and mitigations

- 过度放宽输入：保留字符串 trim 和 80 字符上限。
- 影响其他日期字段：只修改 strategy.availableDate，经历日期继续使用原日期校验器。

## Verification strategy

- 运行 `test:profiles`、typecheck、定向 ESLint 和 production build。
- 用题述 payload 调用实际 PUT API，并重新 GET 确认保存结果。
