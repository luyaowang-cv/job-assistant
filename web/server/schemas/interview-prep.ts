import { z } from 'zod'

export const interviewPrepSectionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(30_000),
})

type NormalizedSection = { id: string; title: string; content: string }

export function normalizeInterviewSections(value: unknown): NormalizedSection[] {
  let raw = value
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>
    if (Array.isArray(record.sections)) raw = record.sections
    else if (Array.isArray(record.data)) raw = record.data
    else if (typeof record.title === 'string' || typeof record.content === 'string') raw = [record]
    else {
      const nested = Object.values(record).filter(candidate => candidate && typeof candidate === 'object')
      if (nested.length) raw = nested
    }
  }
  const items = Array.isArray(raw) ? raw : []
  return items
    .map((item, index): NormalizedSection => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const title = typeof record.title === 'string' ? record.title.trim() : ''
      const content = typeof record.content === 'string' ? record.content.trim() : ''
      const id = typeof record.id === 'string' ? record.id.trim() : ''
      return {
        id: (id || `section-${index + 1}`).slice(0, 64),
        title: (title || `第 ${index + 1} 部分`).slice(0, 80),
        content: (content || title || `第 ${index + 1} 部分`).slice(0, 30_000),
      }
    })
    .filter(section => Boolean(section.title.trim() && section.content.trim()))
}

export const interviewPrepSectionsSchema = z.preprocess(normalizeInterviewSections, z.array(interviewPrepSectionSchema).min(1).max(12))

export const interviewPrepGenerateSchema = z.object({
  resumeVersionId: z.string().trim().min(1).max(64),
  jdText: z.string().trim().max(50_000).optional(),
  extraText: z.string().trim().max(50_000).optional(),
})

export const interviewPrepSaveSchema = z.object({
  resumeVersionId: z.string().trim().min(1).max(64),
  jdText: z.string().trim().max(50_000),
  extraText: z.string().trim().max(50_000),
  sections: interviewPrepSectionsSchema,
})

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
export const interviewReflectionExtractedSchema = z.preprocess(unwrapExtracted, z.object({
  keyPoints: stringArray(30),
  questions: stringArray(30),
  weaknesses: stringArray(20),
  nextFocus: stringArray(20),
}))

export const interviewReflectionPreviewSchema = z.object({
  resumeVersionId: z.string().trim().min(1).max(64),
  recordText: z.string().trim().min(1).max(50_000),
})

export const interviewReflectionConfirmSchema = z.object({
  resumeVersionId: z.string().trim().min(1).max(64),
  recordText: z.string().trim().min(1).max(50_000),
  extracted: interviewReflectionExtractedSchema,
})

export const interviewPrepQuerySchema = z.object({
  resumeVersionId: z.string().trim().min(1).max(64),
})

export type InterviewPrepSection = z.infer<typeof interviewPrepSectionSchema>
export type InterviewPrepSections = z.infer<typeof interviewPrepSectionsSchema>
export type InterviewReflectionExtracted = z.infer<typeof interviewReflectionExtractedSchema>
export type InterviewPrepGenerateInput = z.infer<typeof interviewPrepGenerateSchema>
export type InterviewPrepSaveInput = z.infer<typeof interviewPrepSaveSchema>
export type InterviewReflectionPreviewInput = z.infer<typeof interviewReflectionPreviewSchema>
export type InterviewReflectionConfirmInput = z.infer<typeof interviewReflectionConfirmSchema>