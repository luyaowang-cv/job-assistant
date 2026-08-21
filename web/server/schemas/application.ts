import { z } from 'zod'

export const applicationStatusSchema = z.enum([
  'SAVED',
  'PREPARING',
  'APPLIED',
  'WRITTEN_TEST',
  'INTERVIEWING',
  'OFFERED',
  'REJECTED',
  'WITHDRAWN',
])

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
  source: z.enum(['KANBAN', 'DETAIL', 'AGENT']).default('DETAIL'),
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
})

export const applicationIdSchema = z.object({
  id: z.string().trim().min(1).max(64),
})

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>
