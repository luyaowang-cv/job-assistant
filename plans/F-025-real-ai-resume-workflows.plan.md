# F-025 实施计划

1. 先更新隐私、Provider、API 失败语义和持久化契约。
2. 扩展教育 Schema/UI/A4 渲染，移除经历卡片左侧蓝线。
3. 提取共享 OpenAI-compatible JSON 客户端，统一超时、错误映射、JSON 解析和 Zod 校验。
4. 替换岗位评估、投递材料、简历优化与卡片 JD 改写 Provider，并传递真实 provider/model。
5. 增加无网络单元测试与真实配置连通性检查，执行 typecheck、lint、相关测试和 production build。
