import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max).optional()

export const jobIdSchema = z.object({
  id: z.string().trim().min(1).max(64),
})

export const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: text(120),
  location: text(120),
  industry: text(80),
  companyType: text(80),
  recruitmentType: text(80),
  hasWrittenTest: z.enum(['true', 'false', 'null']).transform(value => value === 'null' ? null : value === 'true').optional(),
  includeOffline: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
})

export const feishuImportSchema = z.object({
  shareUrl: z.string().trim().url().max(2_048).refine(
    value => /^https:\/\/([\w-]+\.)?(feishu\.cn|larksuite\.com)\//i.test(value),
    'shareUrl must be a Feishu or Lark public share URL.',
  ),
})

export const defaultFeishuShareUrl = 'https://yal2at57cvq.feishu.cn/base/GtSLbyyR3aCENOsJYC6cdlsVnih?table=tblH4au5rnBcqHgJ&view=vewMjMLWkM'

const sourceText = z.string().trim().max(8_000).nullish().transform(value => value || null)
const optionalUrl = z.string().trim().url().max(8_000).nullish().catch(null).transform(value => value || null)
const sourceDate = z.coerce.date().nullish().transform(value => value ?? null)

export const importedJobRowSchema = z.object({
  companyName: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(4_000),
  location: sourceText,
  industry: z.string().trim().max(500).nullish().transform(value => value || null),
  companyType: z.string().trim().max(500).nullish().transform(value => value || null),
  recruitmentType: z.string().trim().max(500).nullish().transform(value => value || null),
  announcementUrl: optionalUrl,
  url: optionalUrl,
  sourceUpdatedAt: sourceDate,
  hasWrittenTest: z.boolean().nullable(),
  deadlineAt: sourceDate,
})

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>
export type ImportedJobRow = z.infer<typeof importedJobRowSchema>
export type FeishuImportInput = z.infer<typeof feishuImportSchema>
