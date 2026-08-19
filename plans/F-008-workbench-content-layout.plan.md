# F-008 Implementation Plan

## Architecture approach

页面根 section 保持全宽；利用直接子卡片与底部操作区的 Tailwind 类，使内容在宽屏居中且最大宽度受控，并移除顶部介绍节点。

## Contract changes

- 无。

## Implementation sequence

1. 更新三个页面根容器、直接子卡片与底部操作区的间距/宽度类，并移除页首节点。
2. 运行类型检查。

## Risks and mitigations

- 保留 `space-y-5`，确保移除页首后卡片之间的垂直间距稳定。

## Verification strategy

- 执行 `corepack pnpm typecheck`。
- 浏览器刷新三个页面，确认布局和内容。
