# F-025 Tasks

- [x] T-001：确认外部目标、允许载荷、禁止载荷、预览/确认边界和失败不回退 Mock 的产品决策。
- [x] T-002：补充教育字段、支持“至今”，按参考图调整 A4 教育布局并移除素材卡片左侧蓝线。
- [x] T-003：实现共享 OpenAI-compatible 结构化 JSON 客户端和稳定错误。
  执行记录（2026-08-17）：统一 `/chat/completions`、60/90 秒超时、JSON fence 清理、Zod 校验，以及 KEY/网络/HTTP/结构四类稳定错误；失败不回退 Mock。
- [x] T-004：替换岗位评估、投递材料和整份简历优化 Mock Provider。
  执行记录（2026-08-17）：三条预览链路均调用当前 AI 设置的真实 Provider；提示词限制在 JD、偏好、简历与评估事实范围。
- [x] T-005：替换卡片本地排序器，增加输入归属、返回集合和新增数字事实保护。
  执行记录（2026-08-17）：只发送已验证的所选卡片；服务端要求 cardId 集合一一对应，并拒绝改写中新增的数字事实。
- [x] T-006：修正实际 provider/model 的审计持久化与 API 错误响应。
  执行记录（2026-08-17）：AgentRun、ApplicationMaterial、TARGETED ResumeVersion 与候选卡片响应使用当前实际 provider/model；真实 AI 错误透传稳定 code。
- [x] T-007：完成单元测试、类型检查、lint、构建与配置连通性验证。
  执行记录（2026-08-17）：typecheck、改动文件 ESLint、5 项相关测试和 Nuxt production build 全部通过。真实最小请求抵达 DeepSeek 并暴露旧 `OPENAI_API_KEY` 返回 401；已改为 DeepSeek 仅使用 `DEEPSEEK_API_KEY`/`AI_API_KEY`，本地设置 API 返回 200 且准确标记当前专用 Key 未配置。官方文档确认 `deepseek-v4-pro` 与现有 baseUrl 有效。
