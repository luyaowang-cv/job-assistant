# F-045 Implementation Plan

## Architecture approach

首页从「两个接口 + 四个展示模块」改为「一个聚合接口 + 两个区域」。

**接口侧**：新增 `server/services/dashboard.service.ts` 与 `server/api/v1/dashboard/summary.get.ts`，一次返回页面需要的全部数字。原页面同时请求 `/api/v1/applications?pageSize=100` 和一个概览接口，前者受 `pageSize` 上限 100 截断（实际 110 条），且被统计卡片复用后产生错误数字。聚合成一个接口后，页面只发一次请求，统计口径与列表口径彻底分开。

**页面侧**：

```
section.dashboard-home
├─ header.dashboard-heading
├─ section.dashboard-metrics        概览：重点卡 + 今日投递 + 本周投递（grid 三列一行）
├─ div.dashboard-insight
│  ├─ section.dashboard-focus       今日重点
│  └─ div.dashboard-insight__side
│     ├─ section.dashboard-funnel   投递转化
│     └─ section.dashboard-daily    每日投递
├─ el-alert                         数据未连接提示
└─ el-dialog                        投递详情（复用 job-detail__* 版式，状态可编辑）
```

## Contract changes

新增 `GET /api/v1/dashboard/summary?dayStart=&weekStart=`，返回：

- `total` / `active`：概览基数
- `stages[]`：漏斗五档（全部记录 / 投出去了 / 到过笔试 / 到过面试 / 拿到 Offer）
- `rhythm`：`appliedToday`、`appliedThisWeek`、`daysSinceLastActivity`、`daily[]`（近 30 天每日投递量，含 0）
- `focus`：`items[]`（最多 8 条）、`totalActive`、`idleOver14`

既有接口不改。状态写入沿用 `PATCH /api/v1/applications/:id/status`。

## Implementation sequence

1. **服务层聚合**（`dashboard.service.ts`）
   - 漏斗：`reachedAtLeast(statuses)`，条件为「当前状态已在某个集合内」**或**「历史事件中出现过进入该集合的状态变更」。事件用 Prisma 的 JSON 路径过滤 `payload: { path: ['toStatus'], equals }`。先用 SQL 手写一遍口径校验，再用 Prisma 实现，两边结果必须一致（110 / 62 / 64 / 5 / 3 / 0）。
   - 节奏：`appliedSince(from)` 同时统计"状态变更到 APPLIED 的事件"和"直接以已投递及以后状态创建的单"，避免漏算。
   - 每日：取窗口内事件再按天装桶。
   - 待跟进：拉取跟进中与收藏的投递，每条取最近一次事件时间（无事件回退创建时间）算停滞天数，再分档排序。
2. **接口**（`summary.get.ts`）：解析 `dayStart` / `weekStart`，缺失时按服务端本地时间兜底。
3. **页面脚本**：类型声明、一个 `loadSummary()`、漏斗与柱状图共用一个 0→1 的 rAF 进度驱动动画。
4. **页面模板**：按上面的骨架重排，删除四个模块。
5. **弹窗**：复用岗位库 `job-detail__*` 版式，状态改 `el-select`，改动即调 `/status` 接口并重新拉取 summary。
6. **样式**：新增漏斗、柱状图、洞察区网格；删除被移除模块的规则。
7. **文档**：新建 F-045 三件套，在 F-017 与 `docs/UI-DESIGN-SYSTEM.md` 标注取代关系。

## Risks and mitigations

| 风险 | 说明 | 应对 |
|---|---|---|
| 漏斗口径算错 | "到达过某阶段"需要事件历史，写错会让转化率偏低 | 先用 SQL 手写口径，再用 Prisma 实现，两边数值必须完全一致才继续 |
| 前端跑动画依赖真实 DOM 高度 | 柱状图高度由卡片剩余空间决定，用固定高度就不能对齐 | 图表用 `flex:1` + `min-height`，右栏用 flex 列布局吃满剩余高度 |
| 概览卡统计复用列表变量 | 原实现用给列表截断的 `slice(0,3)` 当统计值，显示 3 而非 62 | 统计全部走后端聚合，列表截断只用于列表 |
| `el-select` 默认 `width:100%` | 同优先级下会压过单类选择器，把弹窗头部左侧挤成竖排 | 用 `.dashboard-detail-dialog .dashboard-dialog-status` 提权，并避免用 `> div` 这类标签选择器（`el-select` 根元素也是 `div`，会被一起命中） |
| 时区 | 服务端可能是 UTC 容器，"今天"会算错 8 小时 | 日期边界由前端按浏览器时区算好传入 |
| 验证脚本写坏真实数据 | 首轮验证用真实投递测试状态编辑，未完全还原 | 后续验证改为只读；状态编辑类断言不再针对真实数据执行 |

## Verification strategy

**工程校验**

```bash
cd web && pnpm lint && pnpm typecheck && pnpm build
```

**只读浏览器验证**（生产构建 + 独立端口，避免 dev server 反复重建）

- 概览数字：`active` 与 `total` 与数据库直接统计一致；三张卡等宽、同一行、无横铺档位。
- 漏斗：五档数字与手写 SQL 口径一致；每档不小于按当前状态统计的结果。
- 今日重点：`nextAction` 全空时仍有条目；分档顺序单调不降；同档内停滞天数降序；说明文字与右侧状态标签不重复。
- 每日投递：30 根柱子与数据库中每日投递量逐日对应；空槽可见；底边与今日重点底边对齐（实测差 0px）。
- 弹窗：点击行不跳转；`job-detail__*` 版式渲染；状态下拉框宽度受控、头部标题不竖排；弹窗不超出视口高度。
- 响应式：1920 / 1440 / 1366 / 1280 / 1152 / 1024 / 900 / 390 八档下概览区列数与无横向滚动。
- 动画：`prefers-reduced-motion` 下直接落到终值（rAF 动画不受全局 CSS 规则约束，需单独判断）。
