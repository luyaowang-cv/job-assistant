import { z } from 'zod'

import { MATERIAL_CARD_TYPES, MATERIAL_TYPE_SPECS } from '#shared/material-types'

// 类型清单一律从 #shared/material-types.ts 取，不在这里再抄一遍 ——
// 那边是页面渲染用的唯一来源，这里只做校验。两边一旦各写一份，加类型时必然漏一处。
// 数据库的 enum（prisma/schema.prisma 的 MaterialCardType）必须与它保持一致，那是另一份，
// 因为数据库不认识 TypeScript；改这里时记得同步迁移。
export const materialCardTypeSchema = z.enum(MATERIAL_CARD_TYPES)

/** 标题是否必填也来自注册表（目前只有「自我评价」允许留空）。 */
const TITLE_REQUIRED_TYPES = new Set<string>(MATERIAL_CARD_TYPES.filter(type => MATERIAL_TYPE_SPECS[type].titleRequired))
/** 成果要点是否必填同样来自注册表（奖项、证书允许留空）。 */
const CONTENT_REQUIRED_TYPES = new Set<string>(MATERIAL_CARD_TYPES.filter(type => MATERIAL_TYPE_SPECS[type].contentRequired !== false))

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(20).default([])
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const dayPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
/**
 * 日期存到日（YYYY-MM-DD），但 YYYY-MM 必须继续接受：那是"精确到月"那个年代写进库的存量数据。
 * 只认新格式的话，用户点开一张老卡片、什么都不改、保存，就会直接 400。
 * 注意这里不做真实日历校验（2024-02-31 能过），日期选择器本身挡住了这一层。
 */
const isCardDate = (value: unknown): value is string => typeof value === 'string' && (monthPattern.test(value) || dayPattern.test(value))
/**
 * facts 的**形状**校验：所有类型共用，只看已知键的类型与格式。
 *
 * 键白名单不在这里，因为这一层拿不到 type —— 见下面的 validateFactKeys。
 */
const factsSchema = z.record(z.string().max(80), z.unknown()).superRefine((facts, context) => {
  const startDate = facts.startDate
  const endDate = facts.endDate
  for (const key of ['organization', 'role'] as const) {
    const value = facts[key]
    if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 160)) {
      context.addIssue({ code: 'custom', path: [key], message: `${key} must be a non-empty string within 160 characters.` })
    }
  }
  if (facts.techStack !== undefined && (!Array.isArray(facts.techStack) || facts.techStack.length > 20 || facts.techStack.some(value => typeof value !== 'string' || !value.trim() || value.length > 60))) {
    context.addIssue({ code: 'custom', path: ['techStack'], message: 'techStack must contain up to 20 non-empty strings.' })
  }
  if (startDate !== undefined && !isCardDate(startDate)) {
    context.addIssue({ code: 'custom', path: ['startDate'], message: 'startDate must use YYYY-MM or YYYY-MM-DD.' })
  }
  if (endDate !== undefined && (typeof endDate !== 'string' || (endDate !== '至今' && !isCardDate(endDate)))) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must use YYYY-MM or YYYY-MM-DD, or 至今.' })
  }
  if (isCardDate(startDate) && isCardDate(endDate) && startDate > endDate) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must not be earlier than startDate.' })
  }
}).default({})

/**
 * 每种类型允许出现在 facts 里的键，直接从注册表的 fields 推（dateRange 同时写 startDate 和 endDate）。
 * 以后加字段只改注册表，这里自动跟上。
 *
 * 为什么只在建卡时用它：PATCH 的请求体里没有 type，schema 这一层拿不到卡片类型，要 service 查库才知道。
 * 好在编辑时前端是用注册表重建 facts 的，不会发出多余的键，所以更新路径保留上面的形状校验就够了。
 */
const FACT_KEYS_BY_TYPE: Record<string, Set<string>> = Object.fromEntries(
  MATERIAL_CARD_TYPES.map(type => [
    type,
    new Set(MATERIAL_TYPE_SPECS[type].fields.flatMap(field => field.kind === 'dateRange' ? [field.key, 'endDate'] : [field.key])),
  ]),
)

export const materialVariantInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(20_000),
}).strict()

/**
 * 建卡时的文案校验：内容可以留空，是否必填由注册表的 contentRequired 决定。
 * 而"新增或覆盖文案版本"（saveMaterialVariantSchema）仍然要求非空——一个版本存空内容没有意义。
 */
const createVariantSchema = z.object({
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().max(20_000),
}).strict()

export const saveMaterialVariantSchema = materialVariantInputSchema.extend({
  overwrite: z.boolean().default(false),
}).strict()

const materialTitleSchema = z.string().trim().max(160)

export const createMaterialCardSchema = z.object({
  type: materialCardTypeSchema,
  title: materialTitleSchema,
  tags: tagsSchema,
  facts: factsSchema,
  variant: createVariantSchema,
}).strict().superRefine((value, context) => {
  if (TITLE_REQUIRED_TYPES.has(value.type) && !value.title) {
    context.addIssue({ code: 'custom', path: ['title'], message: 'Title is required for this material type.' })
  }
  if (CONTENT_REQUIRED_TYPES.has(value.type) && !value.variant.content) {
    context.addIssue({ code: 'custom', path: ['variant', 'content'], message: 'Content is required for this material type.' })
  }
  // 按类型拒绝不认识的键：奖项卡不该有 endDate，项目卡不该有 paperUrl。
  // 存量数据扫过一遍（2026-10-24），没有任何注册表之外的键，所以这条不会把老卡片挡在门外。
  const allowed = FACT_KEYS_BY_TYPE[value.type] ?? new Set<string>()
  for (const key of Object.keys(value.facts)) {
    if (!allowed.has(key)) {
      context.addIssue({ code: 'custom', path: ['facts', key], message: `Unknown fact key "${key}" for this material type.` })
    }
  }
})

export const updateMaterialCardSchema = z.object({
  title: materialTitleSchema.optional(),
  tags: tagsSchema.optional(),
  facts: factsSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one field is required.')

export const materialCardIdSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict()

const queryBoolean = z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean())
export const materialCardListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(160).default(''),
  type: materialCardTypeSchema.optional(),
  tags: z.preprocess(value => typeof value === 'string' ? value.split(',').filter(Boolean) : value, tagsSchema).default([]),
  includeArchived: queryBoolean.default(false),
}).strict()

export type CreateMaterialCardInput = z.infer<typeof createMaterialCardSchema>
export type UpdateMaterialCardInput = z.infer<typeof updateMaterialCardSchema>
export type MaterialCardListQuery = z.infer<typeof materialCardListQuerySchema>
export type SaveMaterialVariantInput = z.infer<typeof saveMaterialVariantSchema>
