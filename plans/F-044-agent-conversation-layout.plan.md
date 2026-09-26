# F-044 Implementation Plan

> **实施后的更正（阅读正文前请先看这段）**
>
> 正文里"用 `height:100%` 而不是固定算式"的判断是**错的**，实测推翻了它，最终实现改用 `calc(100dvh - 150px)`。
>
> 原因：`.workbench-main`（`el-main`）是 `flex-basis:auto` 的列项，外层 `.workbench-shell` 只有 `min-height` 没有确定高度。用百分比时"父级高度取决于内容、内容又取决于父级高度"会形成循环，浏览器按 `auto` 处理——空态下看着正常，一旦加载消息页面就被撑到 1951px，输入框被顶到视口外 2041px。
>
> 另外两个正文没料到的点：
> - 顶栏实测是 **60px**（Element Plus 的 `--el-header-height` 压过了 UnoCSS 的 `h-14`），所以 chrome 合计是 150px 而不是 146px。
> - 窄屏自动折叠最初用 `useMediaQuery`，但它在 Nuxt SSR 下不会随客户端窗口更新（实测恒为 `false`）；改为自建 `matchMedia` 并放到 `onMounted` 求值。若在 setup 阶段就改写 `collapsed`，服务端与客户端的 class 会对不上，Vue 判定 hydration mismatch 后不回写 class，而这个值之后又不再变化，窄屏下就永远收不起来。

## Architecture approach

页面仍是单文件单组件，不抽出新的子组件：Agent 页的脚本本身就是一段连贯的对话状态机（流式读取、打字机缓冲、持久化），拆分会把 `conversationId`、`messages`、`generating` 等状态全部变成 `v-model` 透传，收益低于改动成本。

布局改为两层横向结构：

```
section.agent-page (flex row, height:100%, overflow:hidden)
├─ aside.agent-rail.material-surface   左：对话栏，260px ↔ 56px
└─ div.agent-chat                      右：对话区，flex:1
   ├─ div.agent-chat__stream           flex:1 / min-height:0 / overflow-y:auto  ← ref="conversation"
   └─ footer.agent-chat__composer      快捷提问 + 输入框 + 发送/停止
```

三个关键取向：

1. **空态与激活态用 CSS 推导，不加新状态。** `:class="{ 'agent-chat--empty': !messages.length }"`。`messages` 已是唯一数据源，`startNewConversation` 清空它、`send()` 往里 push，状态切换天然同步，不存在标志位与数据不同步的可能。
2. **输入区只有一份 DOM。** 快捷提问与输入框放在同一个 composer 里，空态和激活态共用。若各写一份，`v-model="input"` 与 `@keydown.enter.exact.prevent="send"` 需要重复声明，`send()` 也会面对两个输入源。
3. **撑满高度靠 `height:100%` 而非固定算式。** `.workbench-main` 是 `layouts/default.vue` 中 `flex:1` 的列项，高度由 flex 解析为确定值，百分比才有参照物。这样绕开了顶栏到底是 56px（UnoCSS `h-14`）还是 60px（Element Plus `--el-header-height`）的不确定性。

## Contract changes

无。本次不触碰任何 HTTP API、领域模型、Prisma schema 或流式 NDJSON 协议。历史对话列表直接复用现有 `GET /api/v1/career-agent/conversations`——该接口已在 `server/services/career-agent-conversation.service.ts` 返回 `title`、`updatedAt` 与 `_count.messages`，页面 `Conversation` 类型也早已声明这些字段，只是此前未渲染。

## Implementation sequence

1. **脚本层增补**（`web/app/pages/agent/index.vue`）
   - 新增 `collapsed` ref、`narrowViewport = useMediaQuery('(max-width: 1400px)')` 与其 `watch(..., { immediate: true })`；`@vueuse/nuxt` 已在 `nuxt.config.ts` 注册，自动导入。
   - 引入 `Expand`、`Fold` 图标。
   - 新增 `conversationMeta(item)`，拼装"公司 · 消息数 · 日期"。
   - 其余脚本（流式读取循环、打字机、持久化、query 参数处理）一律不动。
2. **模板重排**
   - 删除 `header.agent-heading`、`div.session-strip`、`div.context-docket`、中部 `div.prompt-rack`。
   - 新增 `aside.agent-rail`：头部（新建对话 + 折叠开关）、岗位/简历两个 `el-select`、历史对话 `nav`（按钮列表）、底部状态与删除。
   - 把原 `main.conversation-shell` 改为 `div.agent-chat`，`div.conversation-stream` 改为 `div.agent-chat__stream`，**保留 `ref="conversation"`、`aria-live` 与 `article.message` 内部标记原样**。
   - 快捷提问移入 `footer.agent-chat__composer`。
   - 新增移动端专用 `button.agent-chat__rail-trigger`。
3. **样式整体重写**：替换整块 `<style scoped>`，含移动端媒体查询。主要风险在高度链（见下）。
4. **`AgentMarkdown.vue` 色值令牌化**：写死的 `#26364f`/`#1f3b61`/`#5c527e` 冷蓝色换成 `var(--workbench-*)`；该组件当前仅被 Agent 页引用，改动面可控。
5. **回归验证**：见下。

## Risks and mitigations

| 风险 | 说明 | 应对 |
|---|---|---|
| 撑满高度不生效 / 输入框被顶出屏幕 | flex 子项默认 `min-height:auto` 等于内容高度，消息一长即把 composer 挤出并被 `overflow:hidden` 裁掉——本布局最典型的失败方式 | `.agent-chat` 与 `.agent-chat__stream` 必须显式 `min-height:0`；浏览器内实测后用 `calc(100vh - 146px)` 兜底 |
| 自动滚动静默失效 | `scheduleScrollToBottom` 依赖 `element.scrollTop`，ref 一旦指到非滚动容器就无声失效，不报错 | 改完立即验证"发消息后视口跟到底部"，这是唯一能暴露该问题的方式 |
| 双层滚动条 | `el-main` 自身 `overflow:auto`，页面高度若略微超出会多出一条滚动 | `.agent-page{overflow:hidden}` 且高度精确等于内容区；实测 `el-main.scrollHeight === clientHeight` |
| 侧栏与全局导航挤压内容 | 248px 全局导航 + 260px 对话栏 | 对话列上限 800px；1440px 处已验算（260 + 24 间距 + 800 = 1084 ≤ 可用 1110）；≤1400px 自动折叠 |
| 折叠态移动端无法打开 | ≤767px 对话栏 `display:none`，内部的折叠按钮随之不可达 | 对话区顶部加一个仅移动端显示的 32px 触发按钮 |
| `el-drawer` 引入深色主题泄漏 | `@nuxtjs/color-mode` 与 `themes:['dark']` 已开启，Element Plus 弹层会读取深色变量 | 移动端覆盖层用手写样式而非 `el-drawer`，同时避免侧栏内容重复声明 |

## Verification strategy

**工程校验**

```bash
cd web && pnpm lint && pnpm typecheck && pnpm build
```

已确认 lint 与 typecheck 在实现后无输出。

**布局与高度**（1920×1080 与 1440×900）

- `.agent-page` 高度等于 `.workbench-main` 的 `clientHeight - 40`；`el-main` 的 `scrollHeight === clientHeight`。
- 对话列实测 ≤800px 且左右留白，右侧不贴边。
- 1440 / 1280 / 1024 / 900 逐档缩小：无横向滚动条；1400px 处对话栏折叠一次。

**空态 → 激活态**

- 无历史时打开 `/agent`：卡片垂直居中。
- 输入并回车：卡片外框消失、对话区撑满、输入框贴底、流式输出每帧自动滚到底。
- 带 `?conversationId=` 刷新：加载完成后停在底部且无平滑跳动。

**对话栏**

- 点击历史行加载对话、显示激活样式、URL 参数同步。
- 选中对话后岗位/简历下拉禁用；删除按钮在无对话或生成中禁用。
- 删除后列表刷新：有下一条则自动打开、无则回到空态，两个分支分别验证。
- 折叠/展开切换正常，折叠态条目 `title` 提示完整。

**入口回归**

- `pages/applications/index.vue:198` → `?applicationId=…&mode=evaluate`：岗位选中、输入框预填。
- `pages/resumes/index.vue:165` → `?resumeVersionId=…&mode=optimize`：简历版本预选。
- `pages/interview-prep/index.vue:264` → 参数保留。

**流式行为回归**

- 生成中"停止生成"替换"发送问题"，点击后追加停止提示且部分回答落库。
- 生成中历史列表与新建按钮禁用。
- 切换标签页 10 秒后回来，文字仍在推进。
- "存入面试准备"弹窗、保存与跳转正常。

**规范自检**

- 新样式块中 grep 不到 `#7c6f9d`、6/9/11/13/14/19/20/22/28px 的圆角或间距、`transform: scale`。
- 展开态任意时刻只有一个实心主按钮。

**移动端**（DevTools 390×844）

- 对话栏默认隐藏，顶部按钮可打开；遮罩点击关闭；面板宽 `min(260px, 84vw)`。
- 长对话滚动时输入区保持可见。
