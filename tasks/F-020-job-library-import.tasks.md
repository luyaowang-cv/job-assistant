# F-020 Tasks

## Follow-up: fixed target Bitable table

- [x] T-006: 仅同步「27届秋招🌸」数据表，忽略其他表与左侧文件夹导航。 Verify: 默认链接使用 `tblH4au5rnBcqHgJ`；服务端优先以链接内 `tbl...` ID 读取记录，不存在或无权时无写入并返回明确错误。

- [x] T-001: 扩展领域/API 契约与 Prisma Job 字段并创建迁移。 Verify: Prisma Client 已生成。
- [x] T-002: 实现经 Zod 校验的飞书 OAuth、字段归一化、分页读取和同步 upsert/offline 服务。 Verify: 映射拒绝空公司/岗位；OAuth token 仅加密写入数据库，不出现在 API 响应中。
- [x] T-003: 新增飞书连接状态/授权/断开、岗位列表、同步、转为投递 API，并保证转投递写入 CREATE ApplicationEvent。 Verify: OAuth state 签名且限时，服务层通过唯一约束与并发回读保证重复转投递幂等。
- [x] T-004: 将 `/jobs` 替换为可连接账号、同步、搜索、筛选、分页和转投递的岗位库页面。 Verify: 授权、同步成功/失败、外链和空态均有可恢复反馈。
- [x] T-005: 完成类型、lint、构建和窄屏视觉验证，并回写验证结果。 Verify: Prisma Client 生成、迁移、`vue-tsc --noEmit`、4 个服务/输入测试及功能范围 ESLint 均通过。
