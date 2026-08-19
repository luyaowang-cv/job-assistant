# F-010 Tasks

- [x] T-001: 定义一键 AI 填写的 API、Provider 和扩展安全边界。  
  验证：feature、API/browser/agent-tools 契约覆盖输入、输出和硬排除。  执行记录（2026-08-11）：已将一键流程设为用户明确点击后自动填写，仍固定排除凭据、支付、上传、授权与自动提交。
- [x] T-002: 实现 Zod schema、服务端 AI 映射 API 与模型输出过滤。  
  验证：无 Key、非法字段和模型异常均为可恢复错误，响应不泄露 Key 或页面值。  执行记录（2026-08-11）：已新增 `/api/v1/form-fill/preview`、OpenAI 兼容 Provider Adapter 和 schema；无 Key、Provider 异常与无效输出均返回可恢复错误，schema 测试 2/2 通过。
- [x] T-003: 改造扩展一键填写与绿/红状态高亮。  
  验证：fixture 中可填写字段变绿，普通未填写字段变红，已有/敏感字段不变。  执行记录（2026-08-11）：插件“填写”按钮已改为调用工作台 AI 映射；写入成功设置浅绿色，普通未解决/无法应用字段设置浅红色，已有/敏感字段不变；extension 测试 9/9 与 build 通过。
- [ ] T-004: 完成测试、构建及真实官网人工验收。  
  验证：自动检查通过，用户确认一键流程与高亮效果。  执行记录（2026-08-11）：form-fill schema 2/2、extension 测试 9/9、extension build 和 web typecheck 已通过；待配置服务端 Key 后进行真实官网手工验收。
