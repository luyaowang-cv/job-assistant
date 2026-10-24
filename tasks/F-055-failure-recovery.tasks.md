# F-055 Tasks

- [x] T-001: `specs/contracts/browser-extension.md` 新增 F-055 段（重试/中止码表、等待时长、超时不重试的理由、流式失败原因传播）。 Verify: 覆盖 AC-1 ~ AC-5。
- [x] T-002: 新建 `lib/failure-policy.js`（`ApiError`、`RETRYABLE_CODES`、`ABORTING_CODES`、`retryDelayFor`、`isRetryable`、`isGlobalFailure`）；`main.ts` 删除旧定义并改为 import。 Verify: `main.ts` 内 `class ApiError` 出现次数为 0；全量测试全绿。
- [x] T-003: 补 4 条策略用例：限流 15s/30s 与掉线 1s/3s、超时不重试、未知 5xx/4xx、中止码表。 Verify: AC-1 ~ AC-3 通过。
- [x] T-004: `requestFillStream` 在非 2xx 时读取响应体错误，随 `outcome.error` 返回；回退文案带上原因。 Verify: AC-4 通过。
- [x] T-005: 顺带修正成功文案里过时的颜色说明；跑全量测试与回放，结论回写 spec。 Verify: 152 条基线不退化；回放不变。
