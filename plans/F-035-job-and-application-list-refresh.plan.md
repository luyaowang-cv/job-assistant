# F-035 Implementation Plan

## Architecture approach

在既有 Company/Job/Application 边界内扩展信息：公司介绍归属 Company；内推码和投递注意事项归属 Job。岗位库列表直接使用现有列表响应打开只读详情弹窗；投递看板继续通过 Application 详情 API 打开可编辑抽屉。

## Contract changes

- Company 新增可空 `description`。
- Job 新增可空 `referralCode` 与 `applicationNotes`。
- 岗位导入契约和 Application 创建/更新契约接收对应字段，均由 Zod 限长。
- 列表和详情响应通过现有 Prisma include 自动返回新增字段。

## Implementation sequence

1. 更新领域与 API 契约，增加 Prisma migration。
2. 扩展岗位导入 schema、飞书 Wiki 解析、多来源过滤策略、字段映射和持久化逻辑。
3. 扩展 Application schema、创建/更新服务与事件 changedFields。
4. 为岗位与投递列表查询增加更新时间排序参数。
5. 重构岗位库列表、筛选区与详情弹窗。
6. 重构投递列表、筛选区与详情抽屉。
7. 更新样式和测试并执行验证。
8. 修正飞书导出状态判定、分类污染清理、操作列与全局反馈层级。
9. 将岗位详情入口改为整行点击，调整按钮语义色与侧边导航顺序。
10. 将岗位加入状态改为等宽的“加入面板”与绿色“查看面板”。

## Risks and mitigations

- 公司介绍可能被空导入覆盖：仅在来源非空时更新 Company。
- Wiki 数据源把更新时间写进企业名称：仅识别末尾括号中的明确月日，年份按同步发生年份补齐；无法识别时不改写名称。
- 表格列较多导致小屏拥挤：保持表格横向滚动，操作列固定，文本字段设置合理最小宽度。
- 表格行点击与链接/按钮冲突：显式操作按钮使用 stop 修饰，避免误开详情。
- 可点击岗位行提供指针光标；“加入看板”按钮阻止事件冒泡，外链投递使用成功语义色，删除继续使用危险语义色。

## Verification strategy

- 运行 Zod schema 单元测试覆盖新增导入字段及被移除筛选的兼容解析。
- 运行 Prisma generate 与项目 typecheck/lint/build，确认模型和 Vue 模板类型正确。
- 启动本地页面后检查桌面与窄视口的岗位库弹窗、投递抽屉和固定操作列。
