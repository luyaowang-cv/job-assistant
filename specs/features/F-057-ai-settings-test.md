# F-057: AI 设置页的连接测试

## Goal

AI 设置页只保存地址与模型，不验证。于是配置写错时没有任何反馈——要等到下一次真实填表才暴露，而错误混在填写报告里，看起来像"插件填不动这个页面"。

真实案例：把 `https://api.deepseek.com/anthropic`（Anthropic 格式）填进了 OpenAI Compatible 的地址栏。扩展端拼出 `.../anthropic/chat/completions` 这条不存在的路径，而当时的报错是一句 429，排查方向完全跑偏。

## User scenarios

- 改完 Base URL 和模型，先点「测试连接」，不用保存就能知道通不通。
- 失败时能同时看到：**实际请求的地址**、状态码、上游原话、以及一句"最可能是什么问题"。
- 地址里带着 `/anthropic` 或 `/chat/completions` 这种典型错误时，即使请求还没发也能提示。

## In scope

- 新接口 `POST /api/v1/ai-settings/test`，用表单当前值发一次 `max_tokens: 1` 的请求。
- 纯函数 `chatCompletionsUrl` / `baseUrlHint` / `explainProviderFailure`（`server/lib/ai-endpoint.ts`），与扩展端拼接方式保持一致。
- 设置页新增按钮与结果面板；更新页面上"不会测试连通性"的说明。

## Out of scope

- 自动探测服务商（由地址推断供应商并预填）。
- 保存前强制测试。
- 把测试结果写进任何日志或数据库。

## 验收标准

- AC-1：请求地址与扩展端完全一致（`{Base URL 去尾斜杠}/chat/completions`），测试用例覆盖 `https://api.deepseek.com/anthropic` 拼出不存在的路径这一真实案例。
- AC-2：`baseUrlHint` 能识别 `/anthropic`、`/chat/completions`、`/messages` 三种典型错误，正常地址返回空字符串。
- AC-3：失败按状态码给出原因（401/402/404/429/5xx），并引用上游原文且截断到 300 字内。
- AC-4：响应体不含 API Key；页面不显示 Key。
- AC-5：新增 4 条测试全绿，原有 schema 测试不受影响。

## Risks and open questions

- **测试会产生费用**：`max_tokens: 1`，一次一两 token。页面必须写明，不能让人以为完全免费。
- **表单里的 Key 会被送到服务端**：这是用户自己的 Key 发到自己部署的服务端，且只在内存里用一次、不落库；但仍需在页面上写清"表单里的 Key 优先于已保存的 Key"。
- **地址正确但账号没额度**：测试会成功也可能失败（402/429），这正是要把上游原文显示出来的原因。
