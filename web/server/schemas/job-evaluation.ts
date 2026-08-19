import { z } from 'zod'

const preferenceItemSchema = z.string().trim().min(1).max(80)

export const jobPreferenceSchema = z.object({
  targetRoles: z.array(preferenceItemSchema).max(10),
  targetCities: z.array(preferenceItemSchema).max(10),
  companyTypes: z.array(preferenceItemSchema).max(10),
  technicalFocus: z.array(preferenceItemSchema).max(20),
})

export const updateJobPreferenceSchema = jobPreferenceSchema

// resumeText is intentionally request-only: it is digested in memory and must
// never appear in the AgentRun create/update data or an API response.
export const runJobEvaluationSchema = z.object({
  resumeText: z.string().trim().min(1).max(30_000),
})

export const resumeDigestSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  characterCount: z.number().int().nonnegative(),
  keywordSummary: z.array(z.string().max(40)).max(20),
})

export const jobRequirementSchema = z.object({
  category: z.string().min(1).max(80),
  requirement: z.string().min(1).max(500),
  jdEvidence: z.string().min(1).max(500),
})

export const resumeMatchSchema = z.object({
  area: z.string().min(1).max(80),
  assessment: z.enum(['STRONG', 'PARTIAL', 'MISSING']),
  resumeEvidence: z.string().min(1).max(500),
})

export const gapRiskSchema = z.object({
  type: z.enum(['GAP', 'RISK']),
  description: z.string().min(1).max(500),
  impact: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  evidence: z.string().min(1).max(500),
})

export const applicationPrioritySchema = z.enum([
  'HIGH_APPLY_SOON',
  'MEDIUM_PREPARE_THEN_APPLY',
  'LOW_BACKUP',
  'DO_NOT_APPLY_HARD_MISMATCH',
])

export const preApplicationAdviceSchema = z.object({
  action: z.string().min(1).max(500),
  reason: z.string().min(1).max(500),
})

// The six fields are the stable UI and future-provider contract for F-002.
export const jobEvaluationResultSchema = z.object({
  roleRequirements: z.array(jobRequirementSchema).max(12),
  resumeMatches: z.array(resumeMatchSchema).max(12),
  gapsAndRisks: z.array(gapRiskSchema).max(12),
  matchScore: z.number().int().min(0).max(100),
  priority: applicationPrioritySchema,
  preApplicationAdvice: z.array(preApplicationAdviceSchema).max(8),
})

export type JobPreferenceInput = z.infer<typeof jobPreferenceSchema>
export type RunJobEvaluationInput = z.infer<typeof runJobEvaluationSchema>
export type ResumeDigest = z.infer<typeof resumeDigestSchema>
export type JobEvaluationResult = z.infer<typeof jobEvaluationResultSchema>
