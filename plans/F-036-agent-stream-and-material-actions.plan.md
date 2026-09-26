# F-036 Implementation Plan

## Architecture approach

保持现有 Career Agent NDJSON 流协议不变，将当前生成中的 assistant message 创建为 Vue reactive 对象。网络读取只负责把 delta 写入缓冲区，独立的 `requestAnimationFrame` 消费器按帧自适应追加文本，使上游分块忽快忽慢时仍连续呈现，并将滚动请求合并到单个动画帧。布局仅调整页面级和消息级 CSS。素材库删除未使用操作的前端状态、方法和模板，服务端兼容能力继续保留。

## Contract changes

- 无 API、Schema、Prisma 或事件契约变化。

## Implementation sequence

1. 修正 Agent 消息对象响应式处理与宽度样式。
2. 增加帧级打字缓冲和合并滚动，避免孤立 Markdown 前缀与高频重绘。
3. 移除素材库归档/影响相关前端状态、请求与弹窗。
4. 重组素材详情操作按钮并补充响应式样式。
5. 执行 Agent 流测试、类型检查、Lint 和生产构建。

## Risks and mitigations

- Markdown 高频重渲染可能增加开销：按动画帧批量追加，并根据积压长度动态调整每帧字符数，兼顾连贯感和追赶速度。
- 上游可能在标题标记后短暂停顿：首屏仅有不完整 Markdown 前缀时继续展示“正在组织回答”，等到可读文本后再开始打字。
- 删除前端入口后历史归档数据仍存在：不执行数据库删除，未来仍可通过服务端或恢复入口处理。
- 操作区在小屏换行：容器允许换行但保持 8px 固定间距，标题区域可收缩。

## Verification strategy

- 使用现有 Career Agent 流测试确认 delta 顺序和完成事件。
- 通过类型检查和代码检索确认网络循环不再逐块 `await` 平滑滚动，结束前会排空打字缓冲。
- 运行 Vue 类型检查与 ESLint，确认删除状态后无残留引用。
- 生产构建后重启本地服务并检查 API 健康状态。
- 按用户要求不使用浏览器自动化。
