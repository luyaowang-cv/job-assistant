# F-036 Tasks

- [x] T-001: 修复 Agent 增量消息响应式更新。Verify: `pnpm test:career-agent` 3/3 通过，`pnpm typecheck` 通过
- [x] T-002: 调整 Agent 页面和消息区自适应宽度。Verify: 最终层叠样式将页面和助手消息宽度设为 100%，并覆盖旧的固定上限
- [x] T-003: 删除素材库归档与影响预览前端入口。Verify: 页面无相关文案和无未使用变量
- [x] T-004: 固定素材详情操作组位置和间距。Verify: `pnpm lint` 通过
- [x] T-005: 完成生产构建并重启服务。Verify: `pnpm build` 通过，`/api/v1/jobs` 返回 200
- [x] T-006: 将网络流与视觉打字节奏解耦，隐藏孤立 Markdown 前缀。Verify: 缓冲区按动画帧排空，完成后再持久化完整回答
- [x] T-007: 合并流式自动滚动并完成回归验证。Verify: 流读取循环不再逐块启动 smooth scroll，测试、类型检查、Lint 与构建通过

## Verification

- `pnpm test:career-agent`: 3 passed, 0 failed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed（仅有既有依赖弃用与 Browserslist 提示）
- 网络 delta 与视觉输出已解耦：首屏不展示孤立 `#`/`##`，缓冲积压时自动提高每帧字符数
- 自动滚动按动画帧合并，流读取循环内无逐块滚动等待
- 生产服务已重启并监听 `http://localhost:3000`
- 按用户要求未使用浏览器自动化
