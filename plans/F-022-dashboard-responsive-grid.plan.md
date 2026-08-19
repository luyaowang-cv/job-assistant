# F-022 Implementation Plan

## Architecture approach

使用 CSS Grid 的中间断点重排首页卡片，不修改 Vue 数据结构。断点针对固定侧栏后的实际内容轨道校验。

## Contract changes

- 无。

## Implementation sequence

1. 在多种视口宽度测量卡片宽度、间距和溢出。
2. 补充概览网格与工作区的中间断点。
3. 将规则写入 UI 基准并复测。

## Risks and mitigations

- 风险：只在移动断点处理会使笔记本宽度的布局失真。缓解：增加 1280、1120、900px 三档检查。

## Verification strategy

- 在 1280、1100、1024、900、768px 视口测量网格位置和 `scrollWidth`。
- 执行 Sass 编译。
