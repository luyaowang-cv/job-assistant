# F-017 Implementation Plan

## Architecture approach

保留 `/applications` 的现有业务状态和弹窗逻辑，仅将首页导览区从该页面移出。根路由使用只读的投递列表请求，派生出行动列表和推进机会；跳转只使用 NuxtLink，不引入新服务端状态。

## Contract changes

- 无 API 或数据契约变更。

## Implementation sequence

1. 把首页/投递看板的职责和视觉验收标准写入规格。
2. 更新全局壳层 token，消除默认组件颜色与参考基线的偏差。
3. 实现真实数据驱动的首页及跳转。
4. 将 `/applications` 收束为独立管理页并保留全部交互。
5. 类型检查和本地页面检查。

## Risks and mitigations

- 拆页面导致管理交互回归：不改现有请求、弹窗和状态变更函数，只改页面信息结构。
- 数据库未启动：首页和看板都保留明确的空/错误状态。

## Verification strategy

- 访问 `/` 与 `/applications`，检查导航和跳转。
- 运行 `web/node_modules/.bin/vue-tsc.cmd --noEmit`。
