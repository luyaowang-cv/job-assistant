import { z } from 'zod'

const evidenceSchema = z.string().trim().min(1).max(500)

export const resumeDigestSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  characterCount: z.number().int().nonnegative(),
  keywordSummary: z.array(z.string().max(40)).max(20),
})

export const materialSuggestionSchema = z.object({
  target: z.string().trim().min(1).max(120),
  suggestion: z.string().trim().min(1).max(800),
  evidence: evidenceSchema,
})

export const rewrittenSectionSchema = z.object({
  section: z.string().trim().min(1).max(120),
  originalFocus: z.string().trim().min(1).max(500),
  rewrittenText: z.string().trim().min(1).max(1_500),
  evidence: evidenceSchema,
})

export const greetingSchema = z.object({
  text: z.string().trim().min(1).max(1_000),
  evidence: evidenceSchema,
})

export const applicationMaterialsDraftSchema = z.object({
  resumeSuggestions: z.array(materialSuggestionSchema).min(1).max(8),
  rewrittenSections: z.array(rewrittenSectionSchema).min(1).max(6),
  greetings: z.object({
    short: greetingSchema,
    standard: greetingSchema,
    technicalHighlight: greetingSchema,
  }),
})

export const previewApplicationMaterialsSchema = z.object({
  resumeText: z.string().trim().min(1).max(30_000),
})

export const saveApplicationMaterialsSchema = z.object({
  aiDraft: applicationMaterialsDraftSchema,
  content: applicationMaterialsDraftSchema,
  resumeDigest: resumeDigestSchema,
  evaluationRunId: z.string().trim().min(1).max(64).nullable().optional(),
})

export type ResumeDigest = z.infer<typeof resumeDigestSchema>
export type ApplicationMaterialsDraft = z.infer<typeof applicationMaterialsDraftSchema>
export type SaveApplicationMaterialsInput = z.infer<typeof saveApplicationMaterialsSchema>
