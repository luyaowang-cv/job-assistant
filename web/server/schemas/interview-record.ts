import { z } from 'zod'

export const interviewRoundSchema = z.enum(['FIRST', 'SECOND', 'HR', 'FINAL'])
export const interviewResultSchema = z.enum(['UNDECIDED', 'PASSED', 'FAILED', 'WITHDRAWN'])
export const interviewBlockKindSchema = z.enum(['KNOWLEDGE', 'QUESTION_ASK', 'ROLE_POINT'])

const idSchema = z.string().trim().min(1).max(64)
const optionalIdSchema = idSchema.nullish()

function unwrapList(value: unknown, key: 'blocks' | 'data'): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (Array.isArray(record[key])) return record[key]
    if (Array.isArray(record.sections)) return record.sections
    if (typeof record.kind === 'string' || typeof record.title === 'string' || typeof record.content === 'string') return [record]
    const nested = Object.values(record).filter(candidate => candidate && typeof candidate === 'object')
    if (nested.length) return nested
  }
  return Array.isArray(value) ? value : []
}

export const interviewPrepBlockSchema = z.object({
  id: z.string().trim().min(1).max(64),
  kind: interviewBlockKindSchema,
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(30_000),
})

function normalizeBlocks(value: unknown) {
  const raw = unwrapList(value, 'blocks')
  const items = Array.isArray(raw) ? raw : []
  return (items as Array<Record<string, unknown>>)
    .map((record, index) => {
      const kind = typeof record.kind === 'string' ? record.kind.toUpperCase() : ''
      const title = typeof record.title === 'string' ? record.title.trim() : ''
      const content = typeof record.content === 'string' ? record.content.trim() : ''
      const id = typeof record.id === 'string' ? record.id.trim() : ''
      return {
        id: (id || 'block-' + (index + 1)).slice(0, 64),
        kind: (kind === 'QUESTION_ASK' || kind === 'ROLE_POINT' ? kind : 'KNOWLEDGE'),
        title: (title || '第 ' + (index + 1) + ' 部分').slice(0, 120),
        content: (content || title || '第 ' + (index + 1) + ' 部分').slice(0, 30_000),
      }
    })
    .filter((block: { title: string, content: string }) => Boolean(block.title.trim() && block.content.trim()))
}

export const interviewPrepBlocksSchema = z.preprocess(normalizeBlocks, z.array(interviewPrepBlockSchema).max(60))

function unwrapExtracted(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (record.extracted && typeof record.extracted === 'object') return record.extracted
    if (record.data && typeof record.data === 'object') return record.data
  }
  return value
}

const stringArray = (max: number) => z.preprocess(
  (value) => typeof value === 'string' ? [value] : value,
  z.array(z.string().trim().min(1).max(2_000)).max(max),
)

export const interviewReviewExtractedSchema = z.preprocess(unwrapExtracted, z.object({
  questionsAsked: stringArray(50),
  strengths: stringArray(50),
  improvements: stringArray(50),
}))

export const interviewReviewEntrySchema = z.object({
  id: z.string().trim().min(1).max(64),
  date: z.string().trim().min(1).max(32),
  transcript: z.string().trim().max(50_000),
  extracted: interviewReviewExtractedSchema,
})

export const interviewReviewEntriesSchema = z.array(interviewReviewEntrySchema).max(50)

const baseFields = {
  applicationId: optionalIdSchema,
  resumeVersionId: optionalIdSchema,
  companyName: z.string().trim().max(120).nullish(),
  jobTitle: z.string().trim().max(120).nullish(),
  jdText: z.string().trim().max(50_000).nullish(),
  round: interviewRoundSchema.nullish(),
  interviewAt: z.coerce.date().nullish(),
  methodAndAddress: z.string().trim().max(500).nullish(),
  briefNote: z.string().trim().max(500).nullish(),
  prepSections: interviewPrepBlocksSchema.optional(),
  prepNotes: z.string().trim().max(100_000).nullish(),
  result: interviewResultSchema.nullish(),
  review: interviewReviewEntriesSchema.optional(),
}

export const interviewRecordCreateSchema = z.object(baseFields)

export const interviewRecordUpdateSchema = z.object(baseFields).partial().superRefine((input, context) => {
  if (Object.values(input).every(value => value === undefined)) {
    context.addIssue({ code: 'custom', message: 'At least one editable field is required.' })
  }
})

export const interviewRecordGenerateSchema = z.object({
  applicationId: optionalIdSchema,
  resumeVersionId: optionalIdSchema,
  jdText: z.string().trim().max(50_000).nullish(),
  materialCardIds: z.array(idSchema).max(100).optional(),
})

export const interviewReviewPreviewSchema = z.object({
  transcript: z.string().trim().min(1).max(50_000),
})

export const interviewReviewConfirmSchema = z.object({
  transcript: z.string().trim().min(1).max(50_000),
  extracted: interviewReviewExtractedSchema,
})

export const interviewRecordQuerySchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  applicationId: z.string().trim().min(1).max(64).optional(),
})

export const interviewRecordIdSchema = z.object({
  id: z.string().trim().min(1).max(64),
})

export type InterviewPrepBlock = z.infer<typeof interviewPrepBlockSchema>
export type InterviewReviewExtracted = z.infer<typeof interviewReviewExtractedSchema>
export type InterviewReviewEntry = z.infer<typeof interviewReviewEntrySchema>
export type InterviewRecordCreateInput = z.infer<typeof interviewRecordCreateSchema>
export type InterviewRecordUpdateInput = z.infer<typeof interviewRecordUpdateSchema>
export type InterviewRecordGenerateInput = z.infer<typeof interviewRecordGenerateSchema>
export type InterviewReviewPreviewInput = z.infer<typeof interviewReviewPreviewSchema>
export type InterviewReviewConfirmInput = z.infer<typeof interviewReviewConfirmSchema>