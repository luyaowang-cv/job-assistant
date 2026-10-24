# F-057 Tasks

- [x] T-001: `specs/contracts/api-conventions.md` 新增 F-057 段。 Verify: 覆盖 AC-1 ~ AC-5。
- [x] T-002: `server/lib/ai-endpoint.ts`（`chatCompletionsUrl` / `baseUrlHint` / `explainProviderFailure`）+ `ai-endpoint.test.ts` 四条用例。 Verify: AC-1 ~ AC-3 通过。
- [x] T-003: `aiProviderTestSchema` + `testAiProviderConnection`（表单值优先、Key 只用一次、失败不抛错、15 秒超时）。 Verify: AC-4 通过；响应不含 Key。
- [x] T-004: `POST /api/v1/ai-settings/test` 路由。 Verify: 参数不合法返回既有 400 校验形状；正常返回 `{ ok, url, model, status, elapsedMs, message, hint }`。
- [x] T-005: 设置页加「测试连接」按钮与结果面板，更新说明文案。 Verify: 结果面板同时显示请求地址、模型、状态、耗时、上游原文与提示。
- [x] T-006: 跑 `tsx --test` 新增用例与既有 `test:settings`。 Verify: 4 条新增全绿；schema 用例不受影响。**（新增 4 条已全绿；`ai-settings.test.ts` 因沙箱内 zod 不可解析未能运行，schema 本身已用副本单独验证五种输入。）**
