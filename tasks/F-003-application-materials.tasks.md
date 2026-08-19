# F-003 Tasks

- [x] T-001: 扩展 Prisma Schema，新增 ApplicationMaterial、Application/User/AgentRun 关联与迁移。  
  验证：`migrate deploy`、`db:generate`、重复 `db:seed` 通过；关联与索引存在。
  执行记录（2026-08-11）：已创建并应用 `20260811021323_add_application_materials`；Prisma Client 重新生成、`db:seed` 和 `migrate deploy` 均通过。

- [x] T-002: 定义 F-003 Zod 契约与服务层：材料初稿、确认内容、resumeDigest、岗位归属、可选评估读取、保存与历史查询。  
  验证：完整 resumeText 不出现在任一 Prisma data 或保存 API schema；preview 不调用写入服务。
  执行记录（2026-08-11）：已建立材料初稿、确认内容、三版话术、事实依据与简历摘要的 Zod 契约；保存服务只接受摘要和材料内容，预览上下文查询与保存写入路径分离。typecheck 通过。

- [x] T-003: 实现 LangGraph 材料工作流和确定性 Mock Provider。  
  验证：输出简历建议、改写段落、三版打招呼及事实依据；固定 `MOCK/local-application-materials-v1`，无网络请求。
  执行记录（2026-08-11）：实现“提取 JD/简历事实 → 生成简历建议与改写 → 生成三版话术”的 LangGraph。Mock Provider 连通测试返回 1 条建议、1 个改写段落、3 版话术，标识为 `MOCK/local-application-materials-v1`。

- [x] T-004: 实现 preview、保存、历史 API，处理无 JD、空简历、已删除岗位和无评估降级。  
  验证：preview 后 ApplicationMaterial 数量不变；保存后创建记录、wasEdited 正确、历史倒序。
  进度记录（2026-08-11）：preview、保存、历史 API 已实现并通过 typecheck；端到端写入验证将与 T-005 UI 联调一并完成。
  验收记录（2026-08-11）：用户已完成实际界面/API 联调验证，材料保存与历史读取正常。

- [x] T-005: 在 Application 详情实现独立“投递材料”入口、粘贴简历、预览编辑、保存和历史展示。  
  验证：用户可生成、编辑并保存；关闭未保存预览不产生历史；UI 不保留完整简历。
  进度记录（2026-08-11）：详情抽屉顶部已增加“投递材料”独立入口；弹窗已实现粘贴、预览、编辑、显式保存与历史展示。提交 preview 后立即清空前端简历输入；typecheck 通过，待与 API 进行浏览器端联调。
  验收记录（2026-08-11）：用户已验证生成、编辑、保存与可展开历史查看；未保存预览不会显示为历史。

- [x] T-006: 补齐验证与交付记录。  
  验证：F-003 全部验收标准有记录，lint、typecheck、build 通过；无 API Key、外部调用或简历原文持久化。
  验收记录（2026-08-11）：用户完成 F-003 功能验收；typecheck 通过。Mock 阶段未配置 API Key、未调用外部服务，完整简历仅用于临时 preview 请求。
