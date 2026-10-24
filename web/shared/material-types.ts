// 素材卡片的类型定义：唯一出处。
//
// 同一份「类型知识」原来散在七处：materials/index.vue 里的 timedTypes、detailedTypes、
// technicalTypes、titleLabels、titlePlaceholders、roleLabels、organizationLabels，
// 外加服务端一份不分类型的 facts 校验。加一个类型要改七到九遍，漏一处就是
// 「界面上有输入框但存不进去」或者「存进去了但列表不显示」。
//
// 这个文件只回答三个问题：这个类型叫什么、编辑时该出现哪些字段、列表行副标题拼什么。
// 它**不校验**（那是 server/schemas/material-card.ts 的事），也**不渲染**（那是页面的事）。
// 两边都从这里取，所以判断标准很简单：模板里一旦出现 `if (type === 'AWARD')`，说明知识放错层了。
//
// 纯 TS，不能 import Vue 也不能 import prisma —— 客户端（Vite）、服务端（Nitro）、裸 tsx
// 三种加载器都要能解析它。写法与 shared/application-status.ts 一致。

/** 类型的展示顺序，也是下拉框里的顺序。新增类型在这里加，服务端的 zod 枚举从它推。 */
export const MATERIAL_CARD_TYPES = [
  'PROJECT',
  'INTERNSHIP',
  'WORK',
  'CAMPUS',
  'EDUCATION',
  'AWARD',
  'RESEARCH',
  'CERTIFICATE',
  'SKILL',
  'SELF_EVALUATION',
  'CUSTOM_ANSWER',
] as const

export type MaterialCardType = (typeof MATERIAL_CARD_TYPES)[number]

/**
 * 字段的控件种类。它是「渲染指令」，不是「数据类型」——
 * 同一个 kind 在页面上可能落到不同的 Element Plus 组件。
 */
export type MaterialFieldKind =
  /** 单行文本。相邻的 text 字段会在弹窗里两两并排。 */
  | 'text'
  /**
   * 起止日期 + 「至今」勾选框。主键是 startDate，结束时间写 endDate，进行中写 '至今'。
   * 存的是 YYYY-MM-DD（网申表单普遍要求到日），显示只用前 7 位（简历上只要年月）。
   */
  | 'dateRange'
  /** 单个日期。奖项、证书这类只有一个时间点的事实用它。只写 startDate，不写 endDate。 */
  | 'date'
  /** 一串标签，页面里是逗号/斜杠分隔的字符串，facts 里是 string[]。 */
  | 'techList'
  /** 链接。 */
  | 'url'
  /** 数字（GPA 这类）。facts 里存 number，不是字符串。 */
  | 'number'
  /**
   * 下拉选择。选项在 spec.options 里声明，存的是 option.value（一律存标准词，
   * 不存界面上的文案——插件靠标准词匹配表单下拉框，见 docs 里 OPTION_ALIASES 的说明）。
   */
  | 'select'
  /** 多行文本（专业描述、专业课程这类会写好几行的）。 */
  | 'textarea'

export type MaterialFieldSpec = {
  /** 写进 facts 的键名。改这个键名等于改插件，见 docs 里的映射说明。 */
  key: string
  label: string
  kind: MaterialFieldKind
  placeholder?: string
  /** 字段下方的说明文字。 */
  help?: string
  /** kind === 'select' 时的选项。value 是存进 facts 的标准词，label 是界面文案。 */
  options?: Array<{ value: string, label: string }>
  /** 强制整行。多行文本、链接、技术栈默认就整行，这个用于个别想独占一行的短字段。 */
  fullWidth?: boolean
}

export type MaterialTypeSpec = {
  /** 下拉框与卡片类型角标上的名字。 */
  label: string
  /** 标题输入框的标签。不同类型叫法不同：项目名、公司名、论文名…… */
  titleLabel: string
  titlePlaceholder: string
  /** 只有自我评价允许不写标题。服务端 createMaterialCardSchema 有一致的规则。 */
  titleRequired: boolean
  /**
   * 成果要点（variant.content）是否必填。不填视为必填。
   * 奖项、证书这类只有「名称 + 时间 + 机构」的卡，写不写说明都不影响简历，所以允许留空。
   */
  contentRequired?: boolean
  /**
   * 彻底不显示成果要点输入框（不是"可以留空"，是根本没有这个概念）。
   * 目前只有教育背景用它——简历上的教育段是按字段排版的，没有「一段经历描述」。
   */
  contentField?: 'hidden'
  /** 编辑弹窗里的字段，数组顺序就是渲染顺序。 */
  fields: MaterialFieldSpec[]
  /**
   * 列表行副标题取哪几个键拼。
   * 特殊值 `period` 是派生出来的「起 — 止」，不是 facts 里的键。
   */
  listMeta: string[]
}

// 所有经历类共用的三个字段。抽出来是为了「奖项只有单月时间」这类差异在 P2 更容易改——
// 到时候只改某一个类型的那一段，不动其他类型。
const role = (label: string): MaterialFieldSpec => ({ key: 'role', label, kind: 'text', placeholder: '显示在卡片标题右侧' })
const organization = (label: string): MaterialFieldSpec => ({ key: 'organization', label, kind: 'text' })
const period = (): MaterialFieldSpec => ({ key: 'startDate', label: '起止时间', kind: 'dateRange' })
const date = (label: string): MaterialFieldSpec => ({ key: 'startDate', label, kind: 'date' })
const techStack = (): MaterialFieldSpec => ({
  key: 'techStack',
  label: '技术栈',
  kind: 'techList',
  placeholder: '例如：Claude API / TypeScript / Vue 3 / LangChain',
  help: '使用斜杠、中文逗号或英文逗号分隔；技术栈会直接显示在简历卡片中。',
})

/** 经历类类型共用的列表副标题：角色 · 组织 · 时间。 */
const EXPERIENCE_META = ['role', 'organization', 'period']

export const MATERIAL_TYPE_SPECS: Record<MaterialCardType, MaterialTypeSpec> = {
  PROJECT: {
    label: '项目经历',
    titleLabel: '项目名称',
    titlePlaceholder: '例如：多 Agent 前端迁移系统',
    titleRequired: true,
    fields: [
      role('项目职责 / 角色'),
      organization('所属组织 / 公司'),
      { key: 'projectUrl', label: '项目链接', kind: 'url', placeholder: 'https://github.com/... 或项目主页（可选）' },
      period(),
      techStack(),
    ],
    listMeta: EXPERIENCE_META,
  },
  INTERNSHIP: {
    label: '实习经历',
    titleLabel: '公司名称',
    titlePlaceholder: '例如：搜狐',
    titleRequired: true,
    fields: [role('实习职位'), organization('部门 / 团队（可选）'), period(), techStack()],
    listMeta: EXPERIENCE_META,
  },
  WORK: {
    label: '工作经历',
    titleLabel: '公司名称',
    titlePlaceholder: '例如：某科技公司',
    titleRequired: true,
    fields: [role('工作职位'), organization('部门 / 团队（可选）'), period(), techStack()],
    listMeta: EXPERIENCE_META,
  },
  CAMPUS: {
    label: '校园经历',
    titleLabel: '组织或活动名称',
    titlePlaceholder: '例如：校学生会',
    titleRequired: true,
    fields: [role('担任角色'), organization('学校 / 社团（可选）'), period()],
    listMeta: EXPERIENCE_META,
  },
  EDUCATION: {
    label: '教育背景',
    titleLabel: '学校名称',
    titlePlaceholder: '例如：某某大学',
    titleRequired: true,
    // 教育背景没有「一段经历描述」，简历上的教育段也是按字段排版的：
    // 不是"可以不填"，是这个框根本不该出现，所以两个标记都要打上。
    contentRequired: false,
    contentField: 'hidden',
    // 字段对齐 server/schemas/personal-profile.ts 的 educationSchema，并按网申表单的常见问法补齐。
    // school 是卡片的 title，不重复进 facts；起止时间用 dateRange。
    //
    // 下拉的那些不是"为了好看"：插件填下拉框靠的是标准词匹配（OPTION_ALIASES + 四层匹配），
    // 存「全日制」比存「全日制本科在读」命中率高得多。自由发挥的（学号、专业描述、论文题目）
    // 才用文本。注意这些字段目前**都还没有插件规则**，加完只服务简历和存档。
    fields: [
      { key: 'college', label: '学院', kind: 'text', placeholder: '例如：计算机科学与技术学院' },
      { key: 'major', label: '专业', kind: 'text' },
      {
        key: 'educationLevel',
        label: '学历',
        kind: 'select',
        options: ['大专', '本科', '硕士', '博士', '其他'].map(value => ({ value, label: value })),
      },
      { key: 'academicDegree', label: '学位', kind: 'text', placeholder: '例如：工学学士' },
      {
        key: 'studyMode',
        label: '学习方式',
        kind: 'select',
        options: ['全日制', '非全日制', '其他'].map(value => ({ value, label: value })),
      },
      {
        key: 'duration',
        label: '学制',
        kind: 'select',
        options: ['2 年', '2.5 年', '3 年', '4 年', '5 年', '其他'].map(value => ({ value, label: value })),
      },
      {
        key: 'schoolCategory',
        label: '学校类别',
        kind: 'select',
        options: ['985', '211', '双一流', '普通本科', '海外院校', '其他'].map(value => ({ value, label: value })),
      },
      {
        key: 'trainingMode',
        label: '培养方式',
        kind: 'select',
        options: ['统招', '定向', '委培', '自费', '其他'].map(value => ({ value, label: value })),
      },
      {
        key: 'overseas',
        label: '是否为海外教育经历',
        kind: 'select',
        options: ['是', '否'].map(value => ({ value, label: value })),
      },
      {
        key: 'ranking',
        label: '专业排名',
        kind: 'select',
        // 存标准说法，别名里已经有「专业排名」，插件填下拉时能对上
        options: ['前5%', '前10%', '前20%', '前30%', '前50%', '其他'].map(value => ({ value, label: value })),
      },
      { key: 'gpa', label: 'GPA', kind: 'number' },
      { key: 'gpaScale', label: 'GPA 满分', kind: 'number', placeholder: '例如：4 或 100' },
      { key: 'studentId', label: '学号', kind: 'text' },
      { key: 'campusRole', label: '在校职务', kind: 'text' },
      { key: 'lab', label: '实验室', kind: 'text' },
      { key: 'advisor', label: '导师', kind: 'text' },
      { key: 'researchDirection', label: '研究方向', kind: 'text' },
      { key: 'thesis', label: '毕业论文', kind: 'text', placeholder: '论文题目', fullWidth: true },
      { key: 'majorDescription', label: '专业描述', kind: 'textarea', fullWidth: true },
      { key: 'courses', label: '专业课程', kind: 'textarea', fullWidth: true },
      period(),
    ],
    // 学校名在标题上，副标题取学院和专业，再加一段起止时间
    listMeta: ['college', 'major', 'period'],
  },
  AWARD: {
    label: '荣誉奖项',
    titleLabel: '奖项名称',
    titlePlaceholder: '例如：全国大学生竞赛一等奖',
    titleRequired: true,
    // 奖项/证书没有"经历描述"这回事，写不写说明都不影响简历，所以成果要点可空。
    contentRequired: false,
    // 奖项只有一个获奖时间点。P1 时它和经历类共用起止区间（被迫填两个日期，
    // 列表上显示成「2024-09 — 2024-09」），P2 换成单值。键名仍是 startDate，
    // 不新造 awardedAt —— 否则存量卡片里的日期立刻读不到。
    fields: [role('奖项等级'), organization('关联学校 / 颁发机构（可选）'), date('获奖时间')],
    listMeta: EXPERIENCE_META,
  },
  RESEARCH: {
    label: '科研经历',
    titleLabel: '论文 / 科研项目名称',
    titlePlaceholder: '例如：基于..的方法技术研究',
    titleRequired: true,
    // 科研卡按「一个课题 / 一篇论文」记：作者顺位 + 发表链接 + 起止时间。
    // 去掉了「关联学校 / 实验室」——网申表单里几乎没有这个框，而论文链接是常问的。
    // 时间保留起止区间：在做的课题没有发表时间，用结束时间表达发表时间也够用，
    // 所以不单独加「发表日期」——两个时间字段并存就得额外约定简历显示哪个。
    fields: [
      role('作者顺位 / 研究角色'),
      { key: 'paperUrl', label: '发表链接', kind: 'url', placeholder: 'https://doi.org/... 或论文主页（可选）' },
      period(),
    ],
    listMeta: EXPERIENCE_META,
  },
  CERTIFICATE: {
    label: '证书',
    titleLabel: '证书名称',
    titlePlaceholder: '例如：软考数据库系统工程师',
    titleRequired: true,
    contentRequired: false,
    fields: [role('级别 / 成绩（可选）'), organization('关联学校 / 颁发机构（可选）'), date('取得时间')],
    listMeta: EXPERIENCE_META,
  },
  SKILL: {
    label: '专业技能',
    titleLabel: '技能名称',
    titlePlaceholder: '例如：前端开发',
    titleRequired: true,
    // 技能卡的事实只有熟练程度；具体会什么写在文案里（技能描述）。
    fields: [role('熟练程度')],
    listMeta: ['role'],
  },
  SELF_EVALUATION: {
    label: '自我评价',
    titleLabel: '标题（可选）',
    titlePlaceholder: '可留空；素材库中显示为“自我评价”',
    titleRequired: false,
    fields: [],
    listMeta: ['role', 'organization', 'period'],
  },
  CUSTOM_ANSWER: {
    label: '自定义问答',
    titleLabel: '标题',
    titlePlaceholder: '输入素材标题',
    titleRequired: true,
    fields: [],
    listMeta: ['role', 'organization', 'period'],
  },
}

/** 能两两并排的控件种类。文本和下拉可以混搭（「学历」下拉 + 「学位」文本是很常见的组合）。 */
const PAIRABLE_KINDS = new Set<MaterialFieldKind>(['text', 'select', 'number'])

/**
 * 把字段排成行：相邻两个可并排的控件放一行，其余各占一行，`fullWidth` 强制独占一行。
 *
 * 放在 shared 而不是页面里，是因为它只依赖字段规格、不含任何 Vue 状态——放这儿就能单独测，
 * 也免得验证脚本只能"照着页面代码再抄一遍"，抄错了还看不出来。
 */
export function groupFieldRows(fields: MaterialFieldSpec[]): MaterialFieldSpec[][] {
  const rows: MaterialFieldSpec[][] = []
  for (const field of fields) {
    const previous = rows[rows.length - 1]
    const first = previous?.[0]
    const canPair = !field.fullWidth
      && PAIRABLE_KINDS.has(field.kind)
      && previous?.length === 1
      && first !== undefined
      && !first.fullWidth
      && PAIRABLE_KINDS.has(first.kind)
    if (previous && canPair) previous.push(field)
    else rows.push([field])
  }
  return rows
}

/** 推导出来的类型 → 中文名。只在这里生成，别再手写第二份。 */
export const MATERIAL_TYPE_LABELS = Object.fromEntries(
  MATERIAL_CARD_TYPES.map(type => [type, MATERIAL_TYPE_SPECS[type].label]),
) as Record<MaterialCardType, string>

/** 拿不到就返回 undefined，由调用方决定兜底文案——不在这一层假装知道。 */
export function materialTypeSpec(type: string): MaterialTypeSpec | undefined {
  return MATERIAL_TYPE_SPECS[type as MaterialCardType]
}

export function materialTypeLabel(type: string): string {
  return materialTypeSpec(type)?.label ?? type
}

/**
 * 这个类型有没有「文案版本」这回事。
 *
 * 版本存在唯一理由是装文案（同一段经历的不同写法）；`contentField: 'hidden'` 的类型
 * （教育背景）没有文案，对用户就不该出现版本概念。
 *
 * 注意数据层不能真的省掉版本：`DocumentCardReference.variantId` 是非空外键，
 * 卡片要进简历/网申就必须挂一个 variant。所以这类卡片由系统建一个默认版本，
 * 界面上不显示、也不能新增。
 */
export function materialHasVersion(type: string): boolean {
  return materialTypeSpec(type)?.contentField !== 'hidden'
}

/**
 * 起止时间那一行：`2024-09 — 2025-03`，只有起始时就是 `2024-09`。
 * 空值一律跳过，不留下孤零零的分隔符。
 *
 * 注意这里**只显示到月**：库里存的是 YYYY-MM-DD（网申表单普遍要求到日），
 * 但简历和列表上只要年月。显示精度只在这一处决定，改这里等于同时改简历和列表。
 */
export function materialPeriod(facts: Record<string, unknown>): string {
  return [facts.startDate, facts.endDate]
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .map(monthOf)
    .join(' — ')
}

/** 2024-09-01 → 2024-09；'至今'、空值、年精度原样返回。 */
function monthOf(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : value
}

/**
 * 表单回填用：日期控件吃 YYYY-MM-DD，而存量卡片里存的是 YYYY-MM（精确到月那个年代的数据）。
 * 不补这一天，Element Plus 解析失败会把输入框显示成空，用户会以为日期丢了。
 * 代价是"当月 1 日"这个值当初可能并不存在——显示不出日，所以看不出来。
 */
export function materialDateInput(value: unknown): string {
  if (typeof value !== 'string') return ''
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value
}

/**
 * 技术栈的「写」和「读」必须共用一份定义。
 *
 * 原来页面回填时用 '、' 拼接、保存时按 `, ， /` 拆分，两边分隔符不一致，于是每编辑保存一次
 * 就把数组又合并一层：["Vue","React"] → ["Vue、React"] → ["Vue、React、Vite"]。
 * 界面上看着只是多了一行文字，简历里却全挤在一个条目里。
 *
 * 现在解析接受所有常见分隔符，格式化统一用顿号——中文简历里就是这么写的。
 */
export const TECH_STACK_SEPARATOR = '、'
const TECH_STACK_SPLIT = /[,，/、]/

export function parseTechStack(value: string): string[] {
  return value.split(TECH_STACK_SPLIT).map(item => item.trim()).filter(Boolean)
}

export function formatTechStack(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item !== '').join(TECH_STACK_SEPARATOR)
    : ''
}

/**
 * 列表行副标题：按类型的 listMeta 取键，跳过空值。
 * `period` 是派生键，其余当 facts 的普通键读。
 */
export function materialListMeta(type: string, facts: Record<string, unknown>): string {
  const keys = materialTypeSpec(type)?.listMeta ?? []
  return keys
    .map(key => (key === 'period' ? materialPeriod(facts) : facts[key]))
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' · ')
}
