# F-011 Tasks

- [x] T-001: 定义个人主档案、网申档案、简历版本的字段归属和已解析资料 DTO。  
  验证：Feature、domain/API/browser/agent 契约已明确 `localFacts` 与 `aiContext` 的边界；2026-08-11。
- [x] T-002: 扩展 Prisma/Zod/schema/service，完成非破坏性兼容迁移和 ResumeVersion 归属校验。  
  验证：`20260812090000_add_application_profile_strategy` 已部署；既有网申档案可读取；完整个人主档案可作为 AI 上下文，页面值/DOM/Cookie 不会进入上下文。
- [x] T-003: 重构工作台个人主档案与网申档案界面，支持默认简历版本选择与教育推导展示。  
  验证：网申档案页面不再重复固定资料；历史经历字段在策略保存时不覆盖；2026-08-12 typecheck 已通过。
- [x] T-004: 更新扩展的本地自动填写、AI 字段裁剪和结果报告。  
  验证：明确标签的固定字段先本地填写；未解决字段可由 AI 使用完整主档案处理；插件不自动提交、上传、支付或勾选协议。
- [ ] T-005: 执行 schema、service、web typecheck、extension test/build 和真实官网人工验收。  
  验证：Web typecheck、schema/service 测试 6/6、插件规则 11/11、插件 build 已通过；个人档案、网申继承和填写上下文的只读接口核验均通过。待用户刷新扩展并在真实官网确认一键填写结果。
