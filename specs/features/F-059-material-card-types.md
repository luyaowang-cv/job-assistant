# F-059: 素材卡片类型化字段 + 教育背景卡片化

## Goal

素材卡的 `facts` 现在是自由 JSON，而"每种类型该有哪些字段"这件事没有单一出处：它散在
`web/app/pages/materials/index.vue` 的七张表（`timedTypes` / `detailedTypes` / `technicalTypes` /
`titleLabels` / `titlePlaceholders` / `roleLabels` / `organizationLabels`）、
`web/server/schemas/material-card.ts` 的一份不分类型的 `factsSchema`、
以及 `web/server/services/legacy-material-migration.service.ts` 里的键名映射里。

结果是：加一个类型要改七到九处；`SKILL`、`SELF_EVALUATION` 至今没有可填的字段；
`AWARD` / `CERTIFICATE` 用起止区间表示一个获奖月份；教育背景只能整段显示或整段隐藏。

本功能做三件事：把类型知识收成一份注册表；用注册表把已有类型的字段补对；
把教育背景从个人主档案迁成素材卡，让"哪几段教育进简历"由引用决定而不是由数组决定。

## 背景与决策记录

这一节记录 2026-10-24 讨论后定下的判断，后续实施时不要重新推翻，除非有新事实。

### 决策 1：个人信息不卡片化，继续留在个人主档案

驳回"把整份个人信息做成一张卡放进素材库"的方案，理由是四条实证：

1. **卡片的三件套是「名称 + 事实 + 文案版本」，个人信息没有文案。** `MaterialCardVariant.content`
   在 `createMaterialCardSchema` 里是必填且 `min(1)`，硬塞一句"我的基本信息"只是为了满足约束。
2. **引用表强制要求版本。** `DocumentCardReference.variantId` 是必填外键，而
   `resolveDocument`、简历渲染、插件取数三条链路都在读 `reference.variant.content`。为一张
   永远全选的卡去把它改成可空，代价落在三条已通的链路上。
3. **插件 basic 段不是重复段。** `REPEATABLE_SECTIONS` 里没有 basic，basic 规则的签名是
   `read: c => c.basics.gender`，没有索引。卡片引用那套"第 0 条引用喂第 0 个表单块"的机制
   在 basic 段没有落点，只会多出一个特判分支。
4. **按档案覆盖会逼出复制。** `resolveBasics(主档案, 档案覆盖)` 已经支持按档案覆盖单个键；
   卡片不能部分引用，于是"投上海的档案 vs 投北京的档案"要建两张卡，21 个字段抄两遍。

替代做法（并入 P4）：网申档案右卡加一组只读的「固定信息」模块，让继承可见、可跳转去改。

### 决策 2：教育背景做成卡片，但必须"先打通渲染，再拆默认数组"

用户的真实诉求是"高中不想出现在简历上，本科和硕士要分开控制"。现有实现表达不了：
`web/server/services/document-resolver.ts` 只有 `visibility.educations === false ? [] : input.educations`
这一个整段开关，没有"选哪几条"。

顺序不能反：简历 A4 和 markdown 都从这个 `educations` 数组渲染
（`resume-a4.service.ts`、`resolveDocument`）。先清空数组再打通卡片渲染，简历上的教育会直接消失。
正确顺序是：枚举加值 → 注册表加类型 → 迁移旧数据（保留数组作为 fallback）→
让教育卡片能作为段落进简历 → 最后才停用默认数组。

历史依据：`legacy-material-migration.service.ts` 当年迁移了 workExperiences、projects、skills、
campusExperiences、awards、certificates 六项，**唯独跳过 educations**，原因就是它同时被
简历默认渲染和插件 education 段依赖。这次是有备而来地补上这一项。

### 决策 3：家庭情况不做卡片，放个人主档案的数组字段

与决策 1 同一个判据：家庭成员是姓名、关系、工作单位、职务、电话，全是结构化事实，
拼不出简历里的一行文案。按"有文案的做卡片、没文案的留档案"归类，它属于档案。

（这条修正了 2026-10-24 讨论初稿里"家庭情况适合做卡片"的说法。）

### 决策 4：插件"读得一般"是别名问题，不是归档问题，单独立项

插件认字段只发生在**标签字符串**和**别名表**之间：`matchScore()` 里精确匹配 0.99、
标签包含别名 0.91、别名包含标签 0.8，再叠加段落提示与控件类型加权。所以值存在哪儿不影响识别率。

已知会漏的形态：别名是"生源所在地"而标签是"生源地所在地（区县）"（双向都不包含）、
教师编表单的"户口性质""本人身份"、带括号说明和必填星号的标签。

修法不靠肉眼猜：用 `docs/diagnosis-scripts/` 的真实 dump 离线回放（`replay-dump.mjs`），
先测出未命中的标签集合，再补别名，补完再回放确认没有抢段落。
别名最容易出的错是跨段抢占（"姓名"既在 basic 段又在家庭成员块里）。

**本功能不做这件事**，另开一个功能号（建议 F-060）。

### 决策 5：facts 保持自由 JSON，不在数据库里按类型建列

类型和字段会持续调整，宽表会烂掉。代价是数据库管不住字段合法性，这个责任明确交给
`web/server/schemas/material-card.ts` 做按类型校验。这个取舍要在代码注释里写清楚。

## 用户场景

1. 新建素材时先选类型，表单随即变成该类型该有的字段：项目卡有技术栈和项目链接，
   奖项卡只有一个"获奖时间"而不是起止区间，技能卡有熟练程度，教育卡有学院/专业/GPA/导师。
2. 素材列表每一行的副标题按类型取不同字段（奖项显示"等级 · 颁发机构 · 时间"，
   教育显示"学院 · 专业 · 学历"），而不是所有类型都拼同一个三段式。
3. 教育背景在素材库里和其他经历一样是一张张卡；网申档案和简历里选哪几张，就出现哪几段，
   高中那张不引用就不出现。
4. 网申档案右卡能看到"这份档案会填哪份姓名、电话、学校"，来源标注为个人主档案，点一下能跳过去改。

## In scope

### P1 类型注册表（纯重构，行为不变）

- 新建 `web/shared/material-types.ts`，放类型注册表：`label`、`titleLabel`、`titlePlaceholder`、
  `titleRequired`、`fields[]`（`key` / `label` / `kind` / `max` / `placeholder` / `help`）、
  `listMeta[]`（列表行副标题取哪几个 facts 键）。
  参考 `web/shared/application-status.ts` 的写法与头注释（那边是把"顺序+文案+配色"从六处收到一处）。
- `web/app/pages/materials/index.vue`：删掉七张表与 `supportsXxx()`，模板改成遍历 `fields`，
  按 `kind` 选控件（text / month / monthRange / list / url / number）。
- `web/server/schemas/material-card.ts`：一层薄映射，从注册表推出每种类型的 zod 校验；
  保留现有通用 `factsSchema` 作为兜底，P2 之后再收紧。

### P2 已有类型的字段补全（不动数据库）

字段规格见下方「类型字段规格」。要点：

- `SKILL` 首次有字段：`role`（熟练程度）+ 文案（技能描述）。
- `AWARD` / `CERTIFICATE` 的时间从起止区间改成单值。**复用 `startDate` 键名当单值**，
  不新造 `awardedAt`，否则存量卡片的日期会丢。
- `AWARD` / `CERTIFICATE` / `CUSTOM_ANSWER` 的文案改为非必填（页面层面）；接口层
  `variant.content` 仍必填，缺省时用标题兜底，避免动 schema。
- `RESEARCH` 增加 `paperUrl`。

### P3 教育背景卡片化

- `prisma/schema.prisma`：`MaterialCardType` 加 `EDUCATION`。**两个迁移文件**：
  加枚举值与数据迁移必须分开（PostgreSQL 的 `ALTER TYPE ... ADD VALUE` 新值不能在同一个事务里
  被 INSERT 使用，而 Prisma 每个迁移跑在一个事务里）。
- 注册表加 `EDUCATION`，字段对齐 `web/server/schemas/personal-profile.ts` 的 `educationSchema`：
  学院、专业、学历、学位、GPA、GPA 满分、排名、在校职务、实验室、导师、研究方向、起止时间。
  **一个字段都不能丢**，这些正是现在主档案里有、简历里用得上的细节。
- 迁移服务：按 `legacy-material-migration.service.ts` 的写法把主档案 `educations` 迁成卡片。
- 渲染：让 `EDUCATION` 卡片能作为段落进简历，并在需要时产出一段教育文本。
- 最后：停用 `document-resolver.ts` 里 `educations` 的默认渲染（保留数组读取作为 fallback，
  等存量档案迁完之后再删）。
- 网申档案：教育模块改为从素材卡引用（照 workExperiences / projects 已有的 `fromReference` 先例）。

### P4 消费侧：网申档案可见性 + 插件映射

- `web/app/pages/application-profile/index.vue`：右卡加只读「固定信息」组，显示
  `resolveBasics` 合并后的结果，标注来源「个人主档案」，点击跳 `/personal-profile`。
- `metadata` 修正：`resolveApplicationProfileVersion`（`document-composition.service.ts`）
  用的是 `PersonalProfile.basics`，没有合并这份档案自己的 basics 覆盖；而未保存过版本的档案
  走 `buildFillContexts(resolveProfile(...))`，那边是合并过的。两条路径对 basics 处理不一致。
  现在因为 UI 没有覆盖入口所以没暴露，一旦补上覆盖入口就会变成"改了不生效"。
  **P4 必须把两条路径收敛到 `resolveProfile`**。
- 插件 `extension/lib/form-fill-rules.js`：加 `fromReference('EDUCATION')`，
  键名从 `title` / `facts.college` 等翻译成 `c.educations[i]` 需要的形状。
- 家庭情况：`personal-profile` 加 `familyMembers` 数组字段（`relation` / `name` / `organization`
  / `role` / `phone`），插件 side 暂不加规则（等别名方案定了再说）。

## Out of scope

- 不做插件的别名补漏（单独立项，见决策 4）。
- 不改 `MaterialCardVariant` 的必填约束，不引入"无文案卡片"。
- 不把 `basics` 拆成卡片，不动 `ApplicationProfile.basics` 的覆盖语义（只修 P4 那条不一致）。
- 不做卡片类型的自定义/用户自建类型。
- 不动素材库的工具栏布局、固定窗口高度、"标签筛选框已移除"的现状——这些是既有设计，见
  F-023 与 2026-10-14 的排版调整，本次只改编辑器里的字段与列表行的副标题。

## 类型字段规格

| 类型 | 标题（title） | 事实字段（facts） | 文案（variant） |
| --- | --- | --- | --- |
| PROJECT 项目经历 | 项目名称 | role 角色 / organization 所属组织 / startDate，endDate / techStack[] / projectUrl | 成果要点（必填，现状） |
| INTERNSHIP 实习经历 | 公司名称 | role 职位 / organization 部门 / startDate，endDate / techStack[] | 工作内容（必填） |
| WORK 工作经历 | 公司名称 | role 职位 / organization 部门 / startDate，endDate / techStack[] | 工作内容（必填） |
| CAMPUS 校园经历 | 组织或活动名称 | role 担任角色 / organization 学校或社团 / startDate，endDate | 做了什么（必填） |
| AWARD 荣誉奖项 | 奖项名称 | role 等级 / organization 颁发机构 / startDate 获奖月份（单值） | 描述（可空） |
| RESEARCH 科研经历 | 论文或科研项目名称 | role 作者顺位 / organization 实验室 / startDate，endDate / paperUrl | 研究内容（必填） |
| CERTIFICATE 证书 | 证书名称 | role 级别或成绩 / organization 颁发机构 / startDate 取得月份（单值） | 备注（可空） |
| SKILL 专业技能 | 技能名称 | role 熟练程度 | 技能描述（必填） |
| SELF_EVALUATION 自我评价 | 可空 | 无 | 评价正文（必填） |
| EDUCATION 教育背景（新增） | 学校名称 | college 学院 / major 专业 / educationLevel 学历 / academicDegree 学位 / gpa / gpaScale / ranking 排名 / campusRole 在校职务 / lab 实验室 / advisor 导师 / researchDirection 研究方向 / startDate，endDate | 在校经历 |
| CUSTOM_ANSWER 自定义问答 | 问题 | 无 | 答案（必填） |

`listMeta` 建议：PROJECT `[role, organization, 时间]`、AWARD `[role, organization, startDate]`、
SKILL `[role]`、EDUCATION `[college, major, educationLevel]`、其余沿用 `[role, organization, 时间]`。

## Affected contracts

- **扩展**：`POST /api/v1/material-cards`、`PATCH /api/v1/material-cards/:id`
  - 不收新字段，仍收 `{ type, title, tags, facts, variant }`。`facts` 的合法键随类型变化，
    由 schema 按类型校验；超集不再全类型放行。
  - 新增类型值 `EDUCATION` 出现在 `type` 的可选范围里（`materialCardTypeSchema`）。
- **扩展**：`GET /api/v1/material-cards` 的 `type` 查询参数支持 `EDUCATION`。
- **复用不改**：`/variants`、`/archive`、`/impact-preview`、`/sync` 均不受影响。
- **复用不改**：`GET /api/v1/application-profiles/:id/fill-context` 的响应形状不变；
  P4 只修 basics 的合并来源。

## Risks and open questions

- **跨包定义漂移**：`extension/` 是独立 WXT 工程，import 不到 `web/shared/`，所以键名映射必然
  存在两份。三种做法里选最轻的：web 侧导出键名清单，extension 的 `node --test` 里加一条契约测试
  断言两边集合一致，漂移即红。
- **存量数据兼容**：`AWARD` / `CERTIFICATE` 的单值化复用 `startDate`，不迁移也能读；
  但页面上要能容忍存量卡片同时有 `endDate`（读出来只显示 `startDate`，不报错）。
- **教育迁移的重复导入**：沿用 `legacySourceKey`（`@@unique([userId, legacySourceKey])`）做幂等，
  不要另造机制。
- **教育卡片化后简历变空**：见决策 2 的顺序。里程碑检查点：卡片能进简历且 A4 渲染正常之后，
  才允许停用默认数组。
- **基础信息可见性（P4）会不会变成第二个真相源**：只读展示，不提供就地编辑入口，
  避免和 `/personal-profile` 形成两个写入点。
- **`startDate > endDate` 的通用校验**：`factsSchema` 现在全局校验起止顺序；改成按类型后，
  单值类型要跳过这条，别把 `endDate` 缺失判成错误。

## 工程要点（面试可讲）

- **单一定义源**：同一份类型知识原来散在七到九处，收成一份常量后，加类型从"改七处"变成"加一项"。
  同一个仓库里已有先例（`shared/application-status.ts`），说明这不是一次性的技巧。
- **分层的职责边界**：数据库宽（Json）、应用层严（zod 按类型），合法性推给校验层；
  接口薄、服务层管事务与审计、页面只负责把 spec 翻成控件。判断标准是"模板里出现了按类型的
  `if`，说明知识放错层了"。
- **扩展性来自建模**：卡片用"一个资源 + 一个 type 字段"而不是给每种类型开端点，
  所以加字段不需要加接口。
- **迁移的兼容策略**：保留旧数组作为 fallback、用 `legacySourceKey` 防重复导入、
  复用旧键名避免存量数据丢失。
- **跨包契约**：不能共享代码时，用契约测试锁住两边的一致性。

## 进度

见 `tasks/F-059-material-card-types.tasks.md`。阶段完成时在那边打勾，并在本节记一行日期与结论。

- [x] P1 类型注册表 —— 2026-10-24 完成（`d4e1c3e`）。三个文件：`web/shared/material-types.ts`、
      页面、`server/schemas/material-card.ts`。对照脚本验过 10 个类型 × 11 项与重构前完全一致。
- [x] P2 已有类型字段补全 —— 2026-10-24 完成（`4c83fda`、`a6d9179`）：奖项/证书时间单值化并精确到日、
      技能卡有了熟练程度、科研卡换成发表链接、奖项证书成果要点可空、技术栈读写往返修复、
      建卡时按类型拒绝不认识的 facts 键（T-204，前置扫描确认全库无白名单外的键）。
- [x] P3 教育背景卡片化 —— 2026-10-24 完成（`72ffcf1`、`e5caff9`）。枚举 + 22 个字段 + 迁移脚本 +
      四个取数点 + 取消主档案回退 + 个人档案页移除编辑区。与原计划的偏差见 tasks 里的 T-301~T-307
      （字段数从 12 扩到 22；迁移没走 legacy 服务而是独立脚本；回退是整个取消而不是"停用默认渲染"）。
- [ ] P4 网申档案可见性 + 插件映射

**计划外追加（2026-10-24）**：日期精度从月改到日（网申表单普遍要求到日），显示仍只到月；
同时修掉全站 Element Plus 的英文 locale。两条都记在 tasks 的 T-105 / T-206。
服务端 facts 校验仍是宽松的通用校验：**按类型收紧（T-103 后半）必须先在真实数据上扫一遍
键的分布**，否则老卡片一编辑就保存失败。
