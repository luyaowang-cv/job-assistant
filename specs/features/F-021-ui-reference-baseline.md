# F-021: UI 开发基准与旧样式清理

## Goal

将当前生效的求职工作台视觉参数沉淀为唯一的开发参考，并删除未接入 Nuxt 构建的旧版 UI 样式入口。

## User scenarios

1. 开发新页面时，开发者能够在一份文档中找到尺寸、颜色、层级和组件使用规则。
2. 维护现有页面时，开发者只会修改当前生效的全局样式入口，不会误用旧版样式文件。

## In scope

- 新增 UI 开发基准文档。
- 记录当前生效的 token、可复用结构、表单与按钮尺寸、操作层级和实现约束。
- 移除未被 Nuxt 配置或页面引用的 `ui-system.scss` 及 `ui/` 旧样式目录。

## Out of scope

- 不改变业务逻辑、API、页面字段或路由。
- 不改变当前页面的视觉表现。

## Acceptance criteria

1. `docs/UI-DESIGN-SYSTEM.md` 明确指定 `web/app/assets/scss/index.scss` 为唯一生效的 token 和通用样式来源。
2. 文档包含颜色、间距、圆角、控件尺寸、可复用结构和操作层级规则。
3. Nuxt 只通过 `nuxt.config.ts` 引用 `assets/scss/index.scss`。
4. 未接入构建的 `ui-system.scss` 与 `ui/` 旧样式目录已移除。
5. Sass 编译通过。

## Affected contracts

- 无。本变更仅维护前端样式资产与开发文档。

## Risks and open questions

- 清理失效样式文件前必须确认没有构建入口或页面直接引用，避免误删仍在使用的样式。
