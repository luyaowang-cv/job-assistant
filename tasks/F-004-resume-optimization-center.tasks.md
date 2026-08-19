# F-004 Tasks

- [x] T-001: 增加 Resume、ResumeVersion、版本类型、Application 关联与迁移。  
  验证：同一用户仅一条 Resume；迁移、生成 Prisma Client、seed 与 typecheck 通过。
  执行记录（2026-08-11）：已创建并应用 `20260811025711_add_resume_versions`；Resume.userId 唯一，ResumeVersion 使用 BASE/TARGETED 类型并可选关联 Application。Prisma Client、seed、typecheck 均通过。

- [x] T-002: 实现 F-004 Zod 契约与服务层：基础简历、不可变版本、归属/JD 校验、预览上下文和历史查询。  
  验证：无原地更新历史版本的写入路径；基础简历仅在显式保存 API 中写入。
  执行记录（2026-08-11）：已建立基础简历、定制版本与预览上下文的 Zod/服务层；服务端只提供创建 BASE/TARGETED 版本路径，不提供更新或覆盖历史版本路径。typecheck 通过。

- [x] T-003: 实现 LangGraph 简历优化预览和 Mock Provider。  
  验证：返回完整草稿、修改摘要、事实依据；`MOCK/local-resume-optimization-v1`，无网络请求。
  执行记录（2026-08-11）：已实现“提取 JD 重点 → 生成完整草稿与修改摘要”的 LangGraph Mock Provider，固定为 `MOCK/local-resume-optimization-v1`；草稿不进入数据库。

- [x] T-004: 实现基础简历、版本历史、定制预览、保存派生版本 API。  
  验证：preview 不创建 ResumeVersion；保存后关联 Application；无 JD/越权被拒绝。
  执行记录（2026-08-11）：已实现读取简历、创建基础简历、定制 preview 与另存版本 API；预览与写入路径分离，typecheck 通过。

- [x] T-005: 增加侧边栏入口和 `/resumes` 页面：基础版本、岗位选择、预览编辑、另存版本、历史查看与复制。  
  验证：用户可完成“保存基础简历 → 选岗位 → 预览 → 编辑 → 另存版本”闭环。
  进度记录（2026-08-11）：已增加“简历优化”侧边栏入口与 `/resumes` 页面，支持基础简历首次保存/直接替换、含 JD 岗位选择、Mock 预览编辑、另存定制版本、历史展开与复制。typecheck 通过，待用户界面验收。
  验收记录（2026-08-11）：用户已完成页面闭环验证。

- [x] T-006: 完成验收、Mock 边界和构建验证记录。  
  验证：10 条 Spec 验收标准均有记录，lint、typecheck、build 通过。
  验收记录（2026-08-11）：用户完成 F-004 功能验收；Mock 无外部调用、基础简历替换与定制历史保留边界已确认，typecheck 通过。
