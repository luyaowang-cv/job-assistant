import { z } from 'zod'

export const materialCardTypeSchema = z.enum([
  'PROJECT', 'INTERNSHIP', 'WORK', 'CAMPUS', 'AWARD', 'SKILL', 'SELF_EVALUATION', 'CUSTOM_ANSWER',
])

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(20).default([])
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
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
  if (startDate !== undefined && (typeof startDate !== 'string' || !monthPattern.test(startDate))) {
    context.addIssue({ code: 'custom', path: ['startDate'], message: 'startDate must use YYYY-MM.' })
  }
  if (endDate !== undefined && (typeof endDate !== 'string' || (endDate !== '至今' && !monthPattern.test(endDate)))) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must use YYYY-MM or 至今.' })
  }
  if (typeof startDate === 'string' && typeof endDate === 'string' && endDate !== '至今' && monthPattern.test(startDate) && monthPattern.test(endDate) && startDate > endDate) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must not be earlier than startDate.' })
  }
}).default({})

export const materialVariantInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(20_000),
}).strict()

export const createMaterialCardSchema = z.object({
  type: materialCardTypeSchema,
  title: z.string().trim().min(1).max(160),
  tags: tagsSchema,
  facts: factsSchema,
  variant: materialVariantInputSchema,
}).strict()

export const updateMaterialCardSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
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
