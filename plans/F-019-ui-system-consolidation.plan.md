# F-019 Implementation Plan

## Architecture approach

在全局 SCSS 建立紧凑的语义化 token 层：页面表面、控件表面、文本、边框、间距、圆角与操作颜色。页面继续使用现有 Vue 状态和 Element Plus 组件；资料页通过 `material-*` 类组合布局，而非引入新数据组件。

## Contract changes

- 无。

## Implementation sequence

1. 定义并接入 UI token，统一全局输入、选择、按钮、表格和焦点状态。
2. 收敛首页和投递看板的卡片/导航文字密度，不改信息架构。
3. 重组资料页表面层级，个人档案采用单一主表面和教育内嵌区段。
4. 调整网申档案、简历版本和 API 设置的按钮、表单和说明层级。
5. 在桌面和窄屏视口渲染核验，运行类型与 lint 检查。

## Risks and mitigations

- 全局控件规则可能影响弹窗和抽屉：沿用 Element Plus 变量，并对主表面增加局部覆盖，随后通过投递看板渲染检查。
- 固定保存操作与内容冲突：保持页面底部预留空间，并在窄屏中保证按钮可点击。

## Verification strategy

- 在 `/`、`/applications`、`/resumes`、`/application-profile`、`/personal-profile` 和 `/ai-settings` 截图检查。
- 以 1440px 与 390px 宽度检查布局。
- 运行 `pnpm typecheck` 与 `pnpm lint`。
