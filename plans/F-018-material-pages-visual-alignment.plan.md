# F-018 Implementation Plan

## Architecture approach

建立可复用的 `material-page`、`material-surface` 和 `material-table` 样式层。现有资料页继续使用原有 Vue 状态和 Element Plus 表单，只替换外层结构与标题层级；岗位库只使用静态空状态。

## Contract changes

- 无。

## Implementation sequence

1. 记录视觉对齐范围与验收标准。
2. 增加岗位库路由与侧栏入口。
3. 迁移简历、网申档案和个人档案的页面骨架。
4. 统一透明白内容面，并重组个人档案的视觉分区。
5. 对齐网申档案的新建操作和双列表单控件。
6. 为资料表单固定标签列，消除控件起点错位。
7. 检查路由及已有资料交互不受影响。

## Risks and mitigations

- 资料页表单复杂：只改容器与标题，保留输入组件、绑定和事件。
- 岗位库功能尚未定义：仅显示非交互空状态，不伪造数据。

## Verification strategy

- 访问 `/jobs`、`/resumes`、`/application-profile`、`/personal-profile`。
- 运行 `web/node_modules/.bin/vue-tsc.cmd --noEmit`。
