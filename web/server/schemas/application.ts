import { z } from 'zod'

import { APPLICATION_STATUSES } from '#shared/application-status'

// 状态清单来自 #shared/application-status.ts，不在这里再抄一遍 ——
// 文案、顺序、配色都在那边，这里只做校验。
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES)

export const applicationChannelSchema = z.enum([
  'OFFICIAL_SITE',
  'BOSS',
  'NIUKE',
  'REFERRAL',
  'OTHER',
])

export const jobSourceSchema = z.enum([
  'OFFICIAL_SITE',
  'BOSS',
  'NIUKE',
  'MANUAL',
  'OTHER',
])

const optionalTextSchema = z.string().trim().max(20_000).nullish()
const optionalUrlSchema = z.string().trim().url().max(2_048).nullish()
const optionalSalarySchema = z.number().int().positive().max(1_000_000).nullish()
const optionalDateSchema = z.coerce.date().nullish()

export const createApplicationSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  companyWebsite: optionalUrlSchema,
  companyDescription: optionalTextSchema,
  companyIndustry: z.string().trim().max(80).nullish(),
  companyType: z.string().trim().max(80).nullish(),
  companyTags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  jobTitle: z.string().trim().min(1).max(120),
  department: z.string().trim().max(120).nullish(),
  location: z.string().trim().max(120).nullish(),
  salaryMin: optionalSalarySchema,
  salaryMax: optionalSalarySchema,
  source: jobSourceSchema.default('MANUAL'),
  jobUrl: optionalUrlSchema,
  description: optionalTextSchema,
  referralCode: z.string().trim().max(500).nullish(),
  applicationNotes: optionalTextSchema,
  deadlineAt: optionalDateSchema,
  status: applicationStatusSchema,
  channel: applicationChannelSchema.default('OTHER'),
  appliedAt: optionalDateSchema,
  nextAction: z.string().trim().max(500).nullish(),
  nextActionAt: optionalDateSchema,
  notes: optionalTextSchema,
}).superRefine((input, context) => {
  if (input.salaryMin && input.salaryMax && input.salaryMin > input.salaryMax) {
    context.addIssue({
      code: 'custom',
      path: ['salaryMax'],
      message: 'salaryMax must be greater than or equal to salaryMin.',
    })
  }
})

export const updateApplicationStatusSchema = z.object({
  status: applicationStatusSchema,
  // LIST = 投递看板列表里直接改「当前阶段」那一列。
  // 注意这个枚举不是穷举：面试记录那边（interview-record.service）绕过 schema 直接写 'INTERVIEW_RECORD'。
  source: z.enum(['KANBAN', 'LIST', 'DETAIL', 'AGENT']).default('DETAIL'),
})

export const updateApplicationSchema = z.object({
  companyName: z.string().trim().min(1).max(120).optional(),
  companyWebsite: optionalUrlSchema,
  companyDescription: optionalTextSchema,
  companyIndustry: z.string().trim().max(80).nullish(),
  companyType: z.string().trim().max(80).nullish(),
  companyTags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  jobTitle: z.string().trim().min(1).max(120).optional(),
  department: z.string().trim().max(120).nullish(),
  location: z.string().trim().max(120).nullish(),
  salaryMin: optionalSalarySchema,
  salaryMax: optionalSalarySchema,
  source: jobSourceSchema.optional(),
  jobUrl: optionalUrlSchema,
  description: optionalTextSchema,
  referralCode: z.string().trim().max(500).nullish(),
  applicationNotes: optionalTextSchema,
  deadlineAt: optionalDateSchema,
  channel: applicationChannelSchema.optional(),
  appliedAt: optionalDateSchema,
  nextAction: z.string().trim().max(500).nullish(),
  nextActionAt: optionalDateSchema,
  notes: optionalTextSchema,
}).superRefine((input, context) => {
  if (Object.values(input).every(value => value === undefined)) {
    context.addIssue({
      code: 'custom',
      message: 'At least one editable field is required.',
    })
  }

  if (input.salaryMin && input.salaryMax && input.salaryMin > input.salaryMax) {
    context.addIssue({
      code: 'custom',
      path: ['salaryMax'],
      message: 'salaryMax must be greater than or equal to salaryMin.',
    })
  }
})

export const listApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  status: applicationStatusSchema.optional(),
  channel: applicationChannelSchema.optional(),
  updatedSort: z.enum(['asc', 'desc']).default('desc'),
  view: z.enum(['list', 'kanban']).default('list'),
})

export const applicationIdSchema = z.object({
  id: z.string().trim().min(1).max(64),
})

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>
