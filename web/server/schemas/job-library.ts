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
  updatedSort: z.enum(['asc', 'desc']).default('desc'),
})

export const feishuImportSchema = z.object({
  shareUrl: z.string().trim().url().max(2_048).refine(
    value => /^https:\/\/([\w-]+\.)?(feishu\.cn|larksuite\.com)\//i.test(value),
    'shareUrl must be a Feishu or Lark public share URL.',
  ),
})

export const defaultFeishuShareUrl = 'https://yal2at57cvq.feishu.cn/base/GtSLbyyR3aCENOsJYC6cdlsVnih?table=tblH4au5rnBcqHgJ&view=vewMjMLWkM'
export const referralFeishuShareUrl = 'https://my.feishu.cn/wiki/TfJkwz7yIil5qvktSKOcBJj8nFd?table=tblzpVqcTKlokUA6&view=vewG7JtQCU'

export function extractCompanyNameAndUpdatedAt(rawName: string, year = new Date().getFullYear()) {
  const match = rawName.match(/^(.*?)\s*[（(]\s*(\d{1,2})\s*(?:[-.．/]|月)\s*(\d{1,2})\s*(?:日)?[^）)]*[）)]\s*$/)
  if (!match) return { companyName: rawName, sourceUpdatedAt: null as Date | null }
  const companyName = match[1]?.trim()
  const month = Number(match[2])
  const day = Number(match[3])
  const sourceUpdatedAt = new Date(year, month - 1, day)
  if (!companyName || month < 1 || month > 12 || day < 1 || day > 31 || sourceUpdatedAt.getFullYear() !== year || sourceUpdatedAt.getMonth() !== month - 1 || sourceUpdatedAt.getDate() !== day) {
    return { companyName: rawName, sourceUpdatedAt: null as Date | null }
  }
  return { companyName, sourceUpdatedAt }
}

const sourceText = z.string().trim().max(8_000).nullish().transform(value => value || null)
const optionalUrl = z.string().trim().url().max(8_000).nullish().catch(null).transform(value => value || null)
const sourceDate = z.coerce.date().nullish().transform(value => value ?? null)
const classificationPollution = '婉清学姐冲冲冲的店唯一正版'

export function cleanCompanyClassification(value: string | null | undefined) {
  const cleaned = value?.replaceAll(classificationPollution, '').replace(/^[,、，;；/\s]+|[,、，;；/\s]+$/g, '').trim()
  return cleaned || null
}

const sourceClassification = z.string().trim().max(500).nullish().transform(cleanCompanyClassification)

export const importedJobRowSchema = z.object({
  companyName: z.string().trim().min(1).max(500),
  companyDescription: sourceText,
  title: z.string().trim().min(1).max(4_000),
  location: sourceText,
  industry: sourceClassification,
  companyType: sourceClassification,
  recruitmentType: z.string().trim().max(500).nullish().transform(value => value || null),
  announcementUrl: optionalUrl,
  url: optionalUrl,
  referralCode: sourceText,
  applicationNotes: sourceText,
  sourceUpdatedAt: sourceDate,
  hasWrittenTest: z.boolean().nullable(),
  deadlineAt: sourceDate,
})

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>
export type ImportedJobRow = z.infer<typeof importedJobRowSchema>
export type FeishuImportInput = z.infer<typeof feishuImportSchema>
