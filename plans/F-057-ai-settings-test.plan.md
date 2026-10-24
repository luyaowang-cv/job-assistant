# F-057 Implementation Plan

## Architecture approach

**把"拼地址"和"解释失败"抽成纯函数。** 这两件事是测试按钮的全部价值，也是最容易写错的部分（地址拼错一次，排查跑偏一整天）。放在 `server/lib/ai-endpoint.ts`、不依赖任何运行时，就能用 node 直接跑。

**`chatCompletionsUrl` 必须与扩展端逐字一致。** 扩展是 `${baseUrl.replace(/\/$/, '')}/chat/completions`，这里也必须一样——否则测试说"通了"而实际填表仍失败，比没有测试更糟。用例里专门断言了 `/anthropic` 那条。

**失败当成数据返回，不抛错。** 页面要同时显示状态码、请求地址和上游原话；抛错会被 Nitro 收成 500，三样全丢。

**表单值优先于已保存值。** 这样"改完先测、再保存"成立；表单里填了新 Key 就只用这一次，不落库。

## Contract changes

- `specs/contracts/api-conventions.md` 新增 F-057 段：接口、请求体三个可选字段、响应形状、不得回传 Key、失败不抛错、15 秒超时与计费说明。

## Implementation sequence

1. 契约：补 `api-conventions.md` F-057 段。
2. `server/lib/ai-endpoint.ts` + 4 条用例。
3. `testAiProviderConnection`（服务层）+ `aiProviderTestSchema`（zod）。
4. 路由 `test.post.ts`。
5. 设置页按钮、结果面板、说明文案。
6. 跑测试。

## Risks and mitigations

- **地址拼接与扩展不一致**：以 `chatCompletionsUrl` 为单点，注释指向扩展端同一行；用例锁定。
- **Key 泄露**：响应类型里没有 key 字段；只有 `apiKeyConfigured`。服务层不写日志。
- **误以为免费**：页面与契约都写明"约 1 个 token"。

## Verification strategy

- 单元：4 条（地址拼接含真实错误案例、地址提示、状态码归因、正文截断）。
- schema：`aiProviderTestSchema` 的空对象/换地址/换模型/http 外网地址/多余键五种输入。
- 类型：`vue-tsc` 未在本环境执行（node_modules 断裂），需本机跑。
