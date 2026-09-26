import { z } from 'zod'

export const baseResumeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(50_000),
})

export const resumeOptimizationPreviewSchema = z.object({
  applicationId: z.string().trim().min(1).max(64),
})

export const resumeChangeSchema = z.object({
  change: z.string().trim().min(1).max(500),
  evidence: z.string().trim().min(1).max(500),
})

export const resumeOptimizationResultSchema = z.object({
  optimizedContent: z.string().trim().min(1).max(50_000),
  changeSummary: z.array(resumeChangeSchema).min(1).max(12),
})

export const resumeVersionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(50_000),
  aiDraft: z.string().trim().min(1).max(50_000),
  changeSummary: z.array(resumeChangeSchema).min(1).max(12),
  applicationId: z.string().trim().min(1).max(64).nullable().optional(),
})

export type CreateBaseResumeInput = z.infer<typeof baseResumeSchema>
export type SaveResumeVersionInput = z.infer<typeof resumeVersionSchema>
export type ResumeOptimizationResult = z.infer<typeof resumeOptimizationResultSchema>
