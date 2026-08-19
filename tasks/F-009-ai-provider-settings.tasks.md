# F-009 Tasks

- [x] T-001: 定义统一 Provider 配置、Key 所有权和 API 契约。  
  验证：feature、domain/API/agent-tools 契约明确 Key 不跨 HTTP 边界。  执行记录（2026-08-11）：已明确统一 Key 仅来自服务端 `OPENAI_API_KEY`，HTTP/Prisma/扩展均不得接收或保存 Key。
- [x] T-002: 实现设置模型、迁移、Zod schema、服务和 GET/PUT 路由。  
  验证：配置可按当前用户读写，Key 不在数据库或响应中。  执行记录（2026-08-11）：`AiProviderSetting` 迁移已应用；GET/PUT `/api/v1/ai-settings` 只读写 provider、Base URL、模型和无值 Key 状态。
- [x] T-003: 实现 API 设置页面和导航入口。  
  验证：可保存 Base URL/模型并看到服务端 Key 配置状态。  执行记录（2026-08-11）：已新增“API 设置”导航和页面，明确提示本 Feature 不会调用模型。
- [ ] T-004: 完成迁移、schema 测试、类型检查和手工验收。  
  验证：所有自动检查通过且用户确认页面回显。  执行记录（2026-08-11）：Prisma generate 与迁移已通过，设置 schema 2/2、继承回归 3/3、typecheck 均通过；待用户确认页面回显。
