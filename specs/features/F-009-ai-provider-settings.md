# F-009: 统一 AI Provider 设置

## Goal

为现有 Agent 和后续网申语义识别预留一个工作台统一的 OpenAI 兼容 Provider 设置入口，使扩展永远不持有 API Key。

## User scenarios

1. 用户在工作台“API 设置”中选择 OpenAI 兼容服务的 Base URL 和模型名称。
2. 用户在服务端环境文件中配置唯一的 `OPENAI_API_KEY`，工作台仅显示“已配置/未配置”，不会显示或返回 Key 内容。
3. 后续 Agent、简历优化和网申识别可读取同一份安全 Provider 配置；本 Feature 本身不调用任何模型。

## In scope

- 每个当前用户一份 `AiProviderSetting`：provider、baseUrl、model 与审计时间。
- 服务端从 `OPENAI_API_KEY` 环境变量取得统一 Key；HTTP API、数据库和浏览器均不接收、保存或返回 Key。
- 工作台 API 设置页面、GET/PUT API、Zod 校验、迁移和设置状态展示。
- 允许 HTTPS 地址，以及 `localhost`/`127.0.0.1` 的 HTTP 地址以支持本地 OpenAI 兼容模型。

## Out of scope

- 不在本 Feature 进行真实模型调用、Key 连通性测试、模型计费、流式响应或 API Key 的网页录入/数据库持久化。
- 不改变既有 Mock Agent Provider；后续 Feature 才会按用户显式操作接入真实 Provider。
- 不允许扩展访问环境变量、读取或缓存 API Key。

## Acceptance criteria

1. 用户可在工作台保存并重新读取 provider、baseUrl、model；客户端永远看不到 API Key。
2. 非 HTTPS 的远程地址、无效 URL、空模型或未知字段被 Zod 拒绝；本地 HTTP 地址可保存。
3. 页面清楚显示服务端 `OPENAI_API_KEY` 是否已配置，并说明本轮不会产生模型调用或费用。
4. 迁移、类型检查、设置 schema 测试通过。

## Affected contracts

- `specs/contracts/domain-model.md`
- `specs/contracts/api-conventions.md`
- `specs/contracts/agent-tools.md`

## Risks and open questions

- 当前本地单用户运行时，环境变量中的 Key 由启动服务的用户负责保护；未来多用户模式必须改为每用户加密凭据或外部密钥管理。
- Provider 设置存在并不代表 Key 有效；真实连通性应在后续用户明确发起模型调用时处理。
