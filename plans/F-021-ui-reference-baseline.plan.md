# F-021 Implementation Plan

## Architecture approach

保留 `web/app/assets/scss/index.scss` 作为唯一全局样式入口；以文档解释其中的 token 和语义化结构类，而不是再复制出第二套 SCSS token 文件。

## Contract changes

- 无。

## Implementation sequence

1. 核对 Nuxt CSS 入口与仓库引用。
2. 新增 UI 开发基准文档。
3. 删除确认未引用的旧样式入口与目录。
4. 编译 Sass 并复核入口与文件树。

## Risks and mitigations

- 风险：旧文件可能被隐式构建引用。缓解：先检查 `nuxt.config.ts`、SCSS `@use` 和页面引用，再删除。

## Verification strategy

- 检查 Nuxt 配置仅加载 `index.scss`。
- 搜索仓库不存在 `ui-system.scss` 或旧 `ui/` 目录引用。
- 执行 Sass 编译。
