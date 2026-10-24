# F-059 Tasks

规格见 `specs/features/F-059-material-card-types.md`。每条都在完成后打勾并补一句实测结果。

## P1 类型注册表（纯重构，行为不变）

- [x] T-101: 新建 `web/shared/material-types.ts`：导出 `MATERIAL_CARD_TYPES`（类型顺序）、
      `MATERIAL_TYPE_LABELS`（由 specs 推导，不手写第二份）、`MATERIAL_TYPE_SPECS`
      （`titleLabel` / `titlePlaceholder` / `titleRequired` / `fields[]` / `listMeta[]`）
      与 `materialTypeSpec()` / `materialTypeLabel()` / `materialPeriod()` / `materialListMeta()`。
      **实际 kind 收敛为四个**：`text` / `dateRange` / `date` / `techList` / `url`
      （计划里的 `list` / `number` / `textarea` 没有用到，不提前造）。
      完成 2026-10-24。
      Verify: 用 tsx + 一份带 `#shared/*` 路径映射的 tsconfig 跑通；`tsc` 干净。
- [x] T-102: `web/app/pages/materials/index.vue` 删除七张表与四个 `supportsXxx()`，
      改为遍历 `spec.fields` 渲染，相邻两个 `text` 自动并排；`facts` 组装抽成 `buildFacts()`。
      动态 `v-model` 改用 `:model-value` + `@update:model-value`，因为 key 是运行时字符串，
      `v-model` 的类型推导会失效。完成 2026-10-24。
      Verify: 脚本对照 git 上一版页面的七张表与注册表，10 个类型 × 11 项全部一致。
- [~] T-103: `web/server/schemas/material-card.ts` **部分完成**：`z.enum` 与「标题必填」已改为
      从注册表推出；**按类型的 facts 校验还没做**，仍保留通用 `factsSchema`。
      未做完的原因：收紧会拒绝存量数据里规格之外的键，得先扫一遍库里的键分布。
      完成 2026-10-24（这一半）。
      Verify: `material-card.test.ts` 全绿，含新增的「标题必填由注册表决定」一条。
- [x] T-104: 类型检查与页面实测。完成 2026-10-24。
      Verify: `vue-tsc` 干净（修掉两处 `noUncheckedIndexedAccess` 报错）；
      页面新建/编辑/删除在本地 dev 下走过一遍。
- [x] T-105（计划外）: 全局中文 locale。`app.vue` 没有 `ElConfigProvider`，Element Plus 一直用
      英文 locale，日期面板、分页器、空状态文案全站都是英文。外层包一层注入 `zhCn`。
      完成 2026-10-24。

## P2 已有类型字段补全（不动数据库）

- [x] T-201: `SKILL` 开放字段 `role`（熟练程度）+ 文案（技能描述）；`listMeta` 收成 `[role]`；
      标题标签从兜底的「标题」改成「技能名称」。完成 2026-10-24（`a6d9179`）。
      Verify: 新建技能卡有熟练程度输入框，列表行显示「技能名 · 熟练程度」。
- [x] T-202: `AWARD` / `CERTIFICATE` 的时间改为单值，**复用 `startDate` 键名**，界面只给一个时间控件；
      存量卡片若带 `endDate`，存回去时它会被丢掉（PATCH 是整体替换 facts），这是有意的「编辑即清洗」。
      原计划写的是"月份选择器"，实际按需求做成了精确到日，见 T-206。完成 2026-10-24。
      Verify: 新建奖项卡只有一个时间控件；存量奖项卡编辑后只剩一个日期，不报错。
- [x] T-203（做法与原计划不同）: `RESEARCH` 增加 `paperUrl`、去掉「关联学校 / 实验室」、时间保留起止。
      `AWARD` / `CERTIFICATE` 的文案改为可空——**没有**按原计划"空时用标题兜底"，
      而是在注册表加 `contentRequired: false`，服务端建卡时允许空文案（`saveMaterialVariantSchema`
      仍然要求非空，空版本没有意义）。`CUSTOM_ANSWER` 维持必填：答案空着没有意义。
      完成 2026-10-24（`a6d9179`）。
      Verify: 奖项/证书不填成果要点能创建；项目卡不填仍被拒（schema 测试 9 条覆盖）。
- [ ] T-204: 收紧 `factsSchema`：按类型拒绝不认识的键（`strict` 语义），
      并让单值类型跳过"起止先后"的通用校验。
      Verify: 给项目卡塞 `relation` 被拒；给奖项卡只传 `startDate` 通过。
- [x] T-205: 回归 `docs/diagnosis-scripts/card-reference-plan-check.mjs` 与
      `cd extension && node --test lib/*.test.js`。完成 2026-10-24。
      Verify: plan-check 全部符合预期；插件测试 **162 条全过**（原计划写的基线 124 是旧数字，
      当前实际基线是 162）。
- [x] T-206（计划外）: 日期精度改到日。素材卡日期存 `YYYY-MM-DD`（控件 `type=date`），
      显示仍只到月（`materialPeriod()` 截前 7 位，列表和 A4 同时生效）。
      服务端校验是**放宽**：`YYYY-MM` 与 `YYYY-MM-DD` 都接受，否则月精度的老卡片一编辑就 400。
      回填时 `materialDateInput()` 把 `YYYY-MM` 补成当月 1 日，否则控件解析失败显示成空。
      副作用：老卡片的结束日期补成 01 之后，插件往"要求到日"的表单里会填 1 日而不是月末。
      完成 2026-10-24。
      Verify: 新增 1 条测试覆盖五种日期输入；`test:materials` 8 条全过；A4 去重后输出逐字一致。
- [x] T-207（计划外）: 表单校验与字段级错误提示。页面接入 el-form 的 rules（必填来自注册表）、
      提交时 `scroll-to-error`；catch 不再写死「保存失败，请检查标题和文案」，而是解析服务端
      `details` 里的 zod issue，按 `path` 翻成中文字段名并标在对应控件下方。
      完成 2026-10-24（`a6d9179`）。
      Verify: 用真 schema 生成的 6 组真实错误验证翻译结果；SFC 编译通过。
- [x] T-208（计划外）: 编辑弹窗从 720px 单列改成两栏（左字段／右成果要点），宽度按视口比例
      `min(1120px, 88vw)`，编辑时收回 760px；单字段行（链接、技术栈、熟练程度）整行铺满。
      完成 2026-10-24（`a6d9179`）。
      Verify: 抽出源码里的 `rowClass` 跑十种类型的行布局，链接框确认落在 wide-grid。
- [x] T-209（计划外，数据 bug）: 技术栈回填用「、」、保存按 `,，/` 拆，两边不一致，
      导致每次编辑保存都把数组合并一层。现改为共用 shared 的 `parseTechStack` / `formatTechStack`。
      完成 2026-10-24（`a6d9179`）。
      Verify: 回归测试做「连续往返两次」，正是该 bug 的准确形态。
- [x] T-210（计划外）: 简历技能段一行一条（`名称：成果要点`），熟练程度不进简历；
      行距用 `unit--skill` 压到 0.8mm，不再沿用模块间距。完成 2026-10-24（`47c235e`）。
      Verify: 隔离目录跑真实渲染函数，5 条断言通过；补一条反向用例锁住「项目经历仍是块状」。

## P3 教育背景卡片化

- [ ] T-301: 迁移一——`prisma/schema.prisma` 的 `MaterialCardType` 加 `EDUCATION`，
      生成只含 `ALTER TYPE ... ADD VALUE` 的迁移文件。
      Verify: `prisma migrate dev` 成功；库里能插入一条 `EDUCATION` 卡片（**在另一个事务里**）。
- [ ] T-302: 注册表加 `EDUCATION` 类型，字段对齐 `web/server/schemas/personal-profile.ts` 的
      `educationSchema`（学院/专业/学历/学位/GPA/GPA 满分/排名/在校职务/实验室/导师/研究方向/起止）。
      Verify: 弹窗里 12 个字段全部可填可存；与 `educationSchema` 逐字段对照无遗漏。
- [ ] T-303: 迁移二——在 `legacy-material-migration.service.ts` 加 educations 源，
      用 `legacySourceKey` 做幂等；个人主档案 `educations` 作为 fallback 保留不动。
      Verify: 预览接口列出教育候选；导入两次不产生重复卡片。
- [ ] T-304: 让 `EDUCATION` 卡片能作为段落进简历（`document-resolver.ts` / 简历渲染路径）。
      Verify: 一份只引用了教育卡片的简历，A4 与 markdown 上都能看到教育段落。
- [ ] T-305: 确认 T-304 在真实数据上正常后，才停用 `document-resolver.ts` 里 `educations` 的默认渲染。
      Verify: 存量档案迁完之后简历不空；未迁移的档案仍能通过 fallback 显示。
- [ ] T-306: 网申档案的教育模块改为卡片引用（照 workExperiences / projects 的 `fromReference` 先例）。
      Verify: 一份档案里引用两张教育卡，`fill-context` 的 `educations` 出现两条且顺序正确。

## P4 网申档案可见性 + 插件映射

- [ ] T-401: `application-profile/index.vue` 右卡加只读「固定信息」组，数据取自
      `resolveBasics` / `resolveEducations` 的结果，标注来源「个人主档案」，点击跳 `/personal-profile`。
      Verify: 改个人主档案的手机号，网申档案页刷新后立刻反映；页面上没有就地编辑入口。
- [ ] T-402: 把两条 basics 取数路径收敛到 `resolveProfile`：`resolveApplicationProfileVersion`
      用合并后的 basics / educations，不再直接读 `PersonalProfile`。
      Verify: 构造一份带 basics 覆盖的档案，保存过版本与未保存版本两条路径返回一致。
- [ ] T-403: 插件加 `fromReference('EDUCATION')`，把卡片的 `title` / `facts` 翻译成 `c.educations[i]`
      需要的形状（键名映射与现有 `INTERNSHIP` 先例保持一致）。
      Verify: `card-reference-plan-check.mjs` 覆盖教育段；插件测试不低于基线 124。
- [ ] T-404: 个人主档案加 `familyMembers` 数组（关系/姓名/工作单位/职务/电话），页面可增删。
      Verify: 保存后重新载入不丢条目；插件侧暂不加规则，`fill-context` 里能原样带出。
- [ ] T-405: 跨包契约测试——web 侧导出卡片键名清单，extension 侧 `node --test` 断言两边集合一致。
      Verify: 故意改错一个键名，测试变红。

## 收尾

- [ ] T-501: 更新 `specs/features/F-059-material-card-types.md` 的「进度」一节，
      记录每个阶段的完成日期与实测结论（含偏差）。
- [ ] T-502: 若 P3 的顺序或 P4 的合并策略在实施中改了，回写「背景与决策记录」，
      并在这里注明改动原因——这是防止后续漂移的关键一步。
