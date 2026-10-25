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
- [x] T-204: 建卡时按类型拒绝不认识的 facts 键。允许的键从注册表 `fields` 推出
      （`dateRange` 展开成 `startDate` + `endDate`），新增字段只改注册表就自动跟上。
      **PATCH 做不到**：请求体里没有 type，schema 这层拿不到卡片类型；好在编辑时前端用注册表重建
      facts，不会发多余键，所以更新路径保留形状校验。完成 2026-10-24。
      前置扫描（`jsonb_object_keys(facts)` 按 type 分组）：全库只有 6 种类型有卡，
      键全部落在注册表内，仅两处遗留——`AWARD.endDate` 1 条、`RESEARCH.organization` 1 条，
      都只存在于从未编辑过的老卡片上，下次保存会被自动清掉，不需要写迁移。
      Verify: schema 测试 10 条全过，含「奖项带 endDate 被拒 / 科研带 organization 被拒 /
      无字段类型不接受任何 key / 起止展开的两个键都放行」。
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

- [x] T-301: `MaterialCardType` 加 `EDUCATION`，迁移只含 `ALTER TYPE ... ADD VALUE`。完成 2026-10-24（`72ffcf1`）。
      **踩到的坑**：`prisma migrate dev` 执行了 SQL 但生成物没更新，dev 服务里的旧 client 不认识新枚举，
      建卡时抛错被 Nitro 收成 500（字段怎么查都没问题）。加枚举值是三步：改 schema → migrate →
      **generate + 重启 dev**。
- [x] T-302: 注册表加 `EDUCATION`。**字段从计划的 12 个扩到 22 个**——按网申常见问法补了学制、
      学号、学习方式、学校类别、培养方式、专业描述、专业课程、毕业论文、是否海外；专业排名改成下拉
      （前5%~前50%/其他），存标准词便于插件匹配。为此新增 `select` / `textarea` / `number` 三种 kind。
      完成 2026-10-24（`72ffcf1`、`e5caff9`）。
      Verify: 共享层测试覆盖字段清单与下拉选项；弹窗里 22 个字段可填可存。
- [x] T-303（做法与原计划不同）: **没有**改 `legacy-material-migration.service.ts`——那套入口绑在
      网申档案上，而教育挂在个人主档案，归属不同。改成一次性脚本 `web/scripts/migrate-education-to-cards.ts`
      （照 `auth-bootstrap.ts` 的风格：先 `--dry-run`、幂等、不删原数据）。完成 2026-10-24。
      Verify: 用户已在本机跑过，迁移生成教育卡成功。
- [x] T-304: `educationsFromReferences`（放在 `document-resolver.ts`，纯函数）把教育卡转成
      `educations` 数组项，四个调用点统一使用：简历预览 / 草稿 / 保存版本 / 网申档案版本。
      顺序按 `sortOrder`（拖动顺序）。完成 2026-10-24（`72ffcf1`）。
      Verify: 4 条单元测试 + 端到端断言（按顺序渲染、字段齐全、学校名只出现一次）。
- [x] T-305（比计划更彻底）: 迁移完成后**直接取消回退**（`?? []`），而不是"停用默认渲染"。
      教育从此只认卡片；同时删掉个人档案页的教育编辑区，并把 `personalProfileSchema.educations`
      从 `.default([])` 改成 `.optional()`——否则页面不提交该字段时会被默认值覆盖成空数组，直接丢数据。
      完成 2026-10-24（`72ffcf1`）。
      Verify: schema 测试确认"只传 basics"不会带上 educations 键。
- [x] T-306: 网申档案版本走同一个函数（第四个调用点），因此自动跟随；
      插件读的 `c.educations` 数组形状没变，**插件侧零改动**。完成 2026-10-24。
      Verify: 端到端断言用的是与插件相同的数组形状。
- [x] T-307（计划外）: A4 里要把教育卡从"补充行"里排掉（否则同一张卡渲染两次）；
      并修掉 `displayMonth` 只认 YYYY-MM 的 bug——日期精度改到日后，教育段会显示成 `2024-09-01`。
      完成 2026-10-24（`72ffcf1`）。

## P4 网申档案可见性 + 插件映射

- [x] T-401: `application-profile/index.vue` 右卡顶部加只读「固定信息」组（姓名/手机/邮箱/现居城市/
      政治面貌/证件类型/紧急联系人），标注「来自个人主档案，所有档案共用」，点击跳 `/personal-profile`。
      数据直接取接口返回的 `basics`（已是合并结果，与插件 fill-context 同源），不另算一份。
      顺带给新档案默认加一个「教育背景」模块——教育只认素材卡，网申里引用教育卡要有模块承载。
      完成 2026-10-24（`30c5342`）。
      Verify: 页面 SFC 编译通过；`basics` 在 listApplicationProfiles 的返回里确实存在。
- [x] T-402: `resolveApplicationProfileVersion` 改用 `resolveBasics(主档案, 本档案覆盖)`，
      与 `resolveProfile()` 同一套规则。完成 2026-10-24（`30c5342`）。
      Verify: application-profile-resolution 5 条测试全过；两条路径现在都调同一个纯函数。
- [x] T-403（**结论：不需要做**）: 教育卡走的是 `resolved.educations` 数组，不是 `fromReference`。
      插件读的 `c.educations[i]` 形状没变，所以只要转换正确，插件侧零改动。完成 2026-10-24（隐含于 P3）。
      Verify: P3 的端到端断言用的就是与插件相同的数组形状。
- [x] T-404: 个人主档案加 `familyMembers`（姓名/关系/工作单位/职务/联系电话/年龄/政治面貌/籍贯），
      页面可增删，关系与政治面貌是下拉（保留 allow-create）。完成 2026-10-25（`40af0b4`）。
      链路：JSON 列（迁移只加列）→ zod optional（不能 default([])，否则清空历史）→
      service「传了才写」+ publicSelect 加列 → 页面 → `resolveProfile` 返回并带进两条 fill-context 路径。
      Verify: schema 测试全过；fill-context 的 localFacts 能看到 familyMembers。
      **插件仍无规则**，数据只到 fill-context 不会被填（归入 T-406）。
- [x] T-407（计划外）: 个人档案表单重排 —— 新增生源地/户籍类型/健康状况/特长/兴趣爱好，
      删掉期望工作地点，民族/政治面貌/户籍类型/健康状况/证件类型改下拉、出生日期改日期选择器，
      证件号码标签随证件类型变且去掉遮罩，个人档案页单独一套 `auto-fill minmax(250px)` 栅格。
      完成 2026-10-25（`40af0b4`）。
      Verify: SFC 与 SCSS 编译通过；`targetCities` 已被 zod 拒绝（页面不再提交）。
      **注意**：新栅格规则权重高于文件底部的小屏单列规则，已在 767px 断点补了同权重声明。
- [ ] T-405: 跨包契约测试——web 侧导出卡片键名清单，extension 侧 `node --test` 断言两边集合一致。
      Verify: 故意改错一个键名，测试变红。
- [ ] T-406（新记）: 给教育卡新增的那批字段补插件规则（学制/学习方式/学校类别/培养方式/是否海外/
      学号/专业描述/专业课程/毕业论文/研究方向以外的…）。**没补之前这些字段对网申零贡献**，
      只服务简历和存档。属于插件侧工作，需跑 162 条测试基线。

## 收尾

- [ ] T-501: 更新 `specs/features/F-059-material-card-types.md` 的「进度」一节，
      记录每个阶段的完成日期与实测结论（含偏差）。
- [ ] T-502: 若 P3 的顺序或 P4 的合并策略在实施中改了，回写「背景与决策记录」，
      并在这里注明改动原因——这是防止后续漂移的关键一步。
