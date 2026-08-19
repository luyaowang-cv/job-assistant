# F-009 Implementation Plan

## Architecture approach

将可公开的 Provider 元数据保存在 `AiProviderSetting`，将唯一 API Key 保持在服务端环境变量。设置服务将两者组合为不含 Key 的状态 DTO；现有和未来 Provider Adapter 只从服务端服务读取该配置。

## Contract changes

- 新增 `/api/v1/ai-settings` GET/PUT；PUT 仅接收 provider、baseUrl、model。
- Agent 工具不得接收或直接读取浏览器传来的 API Key，Provider Adapter 才能读取服务端环境变量。

## Implementation sequence

1. 更新领域、API 和 Agent 工具契约，并新增 feature/plan/tasks。
2. 添加 Prisma 模型、迁移、Zod schema、服务和路由。
3. 添加工作台设置页面和导航入口。
4. 运行迁移、测试与类型检查。

## Risks and mitigations

- URL 被用于后续网络请求：只接受 HTTPS 或显式本地 HTTP 地址。
- Key 泄露：从不进入 API 输入、DTO、Prisma 模型、前端状态或扩展。

## Verification strategy

- schema 单测覆盖 URL 和未知字段拒绝。
- 执行 Prisma generate/migrate、类型检查。
- 手工保存 Base URL/模型并刷新确认回显及 Key 状态。
