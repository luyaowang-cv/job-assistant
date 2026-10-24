# F-059 Tasks

规格见 `specs/features/F-059-material-card-types.md`。每条都在完成后打勾并补一句实测结果。

## P1 类型注册表（纯重构，行为不变）

- [ ] T-101: 新建 `web/shared/material-types.ts`：导出 `MATERIAL_TYPES`（类型顺序）、
      `MATERIAL_TYPE_LABELS`、`MATERIAL_TYPE_SPECS`（`titleLabel` / `titlePlaceholder` /
      `titleRequired` / `fields[]` / `listMeta[]`）与查询函数 `specOf(type)`。
      字段 `kind` 先支持 `text` / `monthRange` / `month` / `list` / `url` / `number` / `textarea`。
      Verify: 裸 tsx 下能 import（走 `#shared` 别名，同 `application-status.test.ts` 的路径）。
- [ ] T-102: `web/app/pages/materials/index.vue` 删除 `timedTypes` / `detailedTypes` / `technicalTypes` /
      `titleLabels` / `titlePlaceholders` / `roleLabels` / `organizationLabels` 与四个 `supportsXxx()`，
      改为从 `specOf(form.type)` 取；编辑弹窗模板改成遍历 `spec.fields` 渲染控件；
      列表行副标题改用 `spec.listMeta`。
      Verify: 同一批已有卡片，改前改后逐张对照——标题、副标题、弹窗出现的字段、标签文案完全一致。
- [ ] T-103: `web/server/schemas/material-card.ts` 改为按类型校验：从注册表推出每种类型的
      `facts` 允许键集合与类型，保留现有通用 `factsSchema` 作为兜底（P2 之后再收紧）。
      Verify: `web/server/schemas/material-card.test.ts` 全绿；补 3 条用例——某类型不允许的键被拒、
      必填字段缺失被拒、合法输入通过。
- [ ] T-104: 跑 `vue-tsc` 与既有单测，确认 P1 没有行为漂移。
      Verify: 类型检查通过；素材库页面在本地 dev 下新建/编辑/删除各走一遍。

## P2 已有类型字段补全（不动数据库）

- [ ] T-201: `SKILL` 开放字段 `role`（熟练程度）+ 文案（技能描述）；`listMeta` 用 `[role]`。
      Verify: 新建一张技能卡，列表行显示技能名 + 熟练程度，详情页能存文案版本。
- [ ] T-202: `AWARD` / `CERTIFICATE` 的时间改为单值，**复用 `startDate` 键名**，界面只给一个月份选择器；
      存量卡片若带 `endDate`，读出时只用 `startDate`，不报错。
      Verify: 新建一张奖项卡只有一个时间控件；存量奖项卡编辑后保存，日期不丢。
- [ ] T-203: `RESEARCH` 增加 `paperUrl`；`AWARD` / `CERTIFICATE` / `CUSTOM_ANSWER` 的文案在页面层改为可空，
      空时提交标题作为内容兜底（接口契约不变）。
      Verify: 三种类型不填文案也能创建成功，详情页显示的是标题文本。
- [ ] T-204: 收紧 `factsSchema`：按类型拒绝不认识的键（`strict` 语义），
      并让单值类型跳过"起止先后"的通用校验。
      Verify: 给项目卡塞 `relation` 被拒；给奖项卡只传 `startDate` 通过。
- [ ] T-205: 回归 `docs/diagnosis-scripts/card-reference-plan-check.mjs` 与
      `cd extension && node --test lib/*.test.js`，确认没有波及卡片进表单的字段映射。
      Verify: plan-check 全 OK；插件测试不低于基线 124。

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
