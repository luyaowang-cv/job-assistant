# F-055 Implementation Plan

## Architecture approach

**先把不可测的策略搬出来，再补一个错误的传播。** 重试与中止的判定是整个填写链路里最难验证的部分，却埋在依赖 `chrome` 的 popup 里。搬到 `lib/` 之后可以用 node 直接跑，把"等三秒还是三十秒""哪些错误该中止"变成断言。

搬运的边界要刻意画清：`ApiError` 的**身份**（`instanceof`）是全链路依赖的，一旦 popup 里还留着一份同名类，所有 `isRetryable` 都会返回 false、重试静默失效。因此 `main.ts` 里必须一处不剩地改为引用，测试里也要覆盖"非 ApiError 一律不重试"这条。

**流式失败的原因必须带出来。** 现在 `!response.ok` 直接返回，调用方于是只能回退、不能说原因。读一次响应体就能让"限流"与"接口不存在"在报告里分开——这正是 F-055 要的"失败要说清是哪一种"。

## Contract changes

- `specs/contracts/browser-extension.md` 新增 F-055 段：重试与中止的码表、等待时长、`NETWORK_TIMEOUT` 不重试的理由、流式失败原因的传播。

## Implementation sequence

1. 契约：补 F-055 段。
2. 新建 `lib/failure-policy.js`，把 `ApiError` 与三组判定搬过去。
3. `main.ts` 删除旧定义并改为 import；确认没有残留同名类。
4. 补 4 条策略用例。
5. `requestFillStream` 读响应体错误并随 `outcome.error` 返回；回退文案带上原因。
6. 顺带把成功文案里过时的"浅绿/浅红"改成 F-054 的三色说法。

## Risks and mitigations

- **`instanceof` 失效**：`main.ts` 里搜索 `class ApiError` 必须为零；测试覆盖非 ApiError 的分支。
- **搬运遗漏**：改动后跑全量测试；任何 `isRetryable` 失效都会表现为"重试不再发生"，而这一层没有运行时日志，所以只能靠用例兜。

## Verification strategy

- 单元：4 条策略用例（等待时长、超时不重试、5xx/4xx、中止码表）。
- 回归：152 条基线全绿；北森 dump 回放不变。
- 真机：用一个必然会 429 的场景（连续快速点击）观察等待文案与最终报告是否说清"被限流"，而不是"页面不接受"。
