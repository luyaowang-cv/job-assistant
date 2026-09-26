# F-044 Tasks

- [x] T-001: 在 `web/app/pages/agent/index.vue` 脚本层新增 `collapsed` ref、`narrowViewport` (useMediaQuery 1400px) 及其 watch ? Verify: `pnpm typecheck` 无输出，且手动把窗口跨过 1400px 时对话栏折叠状态跟随变化
- [x] T-002: 引入 `Expand`/`Fold` 图标并新增 `conversationMeta()` 派生"公司 · 消息数 · 日期" ? Verify: 历史对话行副标题渲染出公司与消息数，未引入任何新的网络请求
- [x] T-003: 删除模板中的 `agent-heading`、`session-strip`、`context-docket` 与中部 `prompt-rack` ? Verify: 打开 `/agent` 首屏直接是对话区，页面顶部不再出现岗位/简历信息模块
- [x] T-004: 新增 `aside.agent-rail`，承载新建对话、折叠开关、岗位与简历 `el-select`、历史对话列表、删除当前对话和模型状态 ? Verify: 对话栏可见，展开态可新建/切换/删除对话，生成中相关按钮禁用
- [x] T-005: 重构对话区为 `div.agent-chat` + `agent-chat__stream`（保留 `ref="conversation"`）+ `agent-chat__composer` ? Verify: 发消息后流式文字逐帧追加且视口始终跟随到底部
- [x] T-006: 4 个快捷提问移入输入框正上方，空态与激活态共用同一份 composer DOM ? Verify: 两种状态下点击 chip 都能把文案填入输入框
- [x] T-007: 新增移动端专用 `agent-chat__rail-trigger` 按钮 ? Verify: 390×844 下对话栏默认隐藏且该按钮可打开覆盖层
- [x] T-008: 整体重写 `<style scoped>`，改用 `--workbench-*` 与 `--space-*` 令牌，移除强制拉满宽度的覆盖规则 ? Verify: 1920px 下对话列 ≤800px 居中且左右留白，`body` 与 `el-main` 均无横向滚动条
- [x] T-009: 实现撑满高度链（`height:100%` + `min-height:0` + `overflow:hidden`）与空态/激活态卡片切换 ? Verify: 空态卡片垂直居中，发首条消息后撑满高度且输入框贴底，`el-main.scrollHeight === clientHeight`
- [x] T-010: 编写 ≤1400px 自动折叠与 ≤767px 覆盖层媒体查询 ? Verify: 跨断点行为符合预期，移动端遮罩点击可关闭对话栏
- [x] T-011: 把 `web/app/components/AgentMarkdown.vue` 的写死冷蓝色值与 5px 圆角换成设计令牌 ? Verify: 回答正文颜色与消息底色协调，样式块中不再出现 `#26364f`/`#1f3b61`/`5px`
- [x] T-012: 修正页面撑满高度的实现：`height:100%` 会被消息撑开（实测 1951px、输入框跑到视口外），改为 `calc(100dvh - var(--agent-chrome))`，实测 chrome 为 150px ? Verify: 1920×1080 下页面 930px、消息流可滚动、composer 底边 1020 < 视口 1080、`el-main` 无第二条滚动条
- [x] T-013: 修正窄屏自动折叠：`useMediaQuery` 在 Nuxt SSR 下不随客户端窗口更新，改为自建 `matchMedia` + `onMounted` 求值，避开 hydration mismatch 导致的 class 不回写 ? Verify: 390×844 下侧栏 `display:none`、1280/1024/900 自动折叠为 56px、1440 保持 260px
- [x] T-014: 修正移动端遮罩常显缺陷，并加 `--ready` 闸门挡住 hydration 前那一帧的覆盖层 ? Verify: 窄屏初始遮罩与侧栏均为 `display:none`，点触发按钮后二者同时出现，点遮罩右侧空白可关闭
- [x] T-015: 浏览器全量验证（Playwright + Chromium，生产构建） ? Verify: 44 项断言全通过，含高度/宽度/无横向滚动/空态与激活态切换/折叠展开/chip 填充/四个响应式断点/移动端覆盖层
- [x] T-016: 回归三个带参数的既有入口 ? Verify: `?applicationId=…&mode=evaluate` 预选岗位并预填分析提问、`?resumeVersionId=…&mode=optimize` 预选版本并预填优化提问、`?conversationId=…` 直开且 URL 参数保留，三项全部通过
- [x] T-017: 回归流式行为（真实 Provider，生产构建） ? Verify: 生成中按钮切为「停止生成」、11 次采样距底始终为 0px、消息增长到 319 字符、流式结束后页面无滚动条且 composer 仍在视口内
- [x] T-018: 跑完整工程校验 ? Verify: `pnpm lint` 仅剩 `login.vue` 的既有 warning、`pnpm typecheck` 无输出、`pnpm build` 成功
