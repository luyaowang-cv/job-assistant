import { z } from 'zod'

const idSchema = z.string().trim().min(1).max(64)

export const careerAgentConversationCreateSchema = z.object({
  applicationId: idSchema.nullish(),
  resumeVersionId: idSchema.nullish(),
}).strict()

export const careerAgentConversationIdSchema = z.object({ id: idSchema })

export const careerAgentStoredMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(50_000),
  error: z.boolean().optional(),
  provider: z.string().trim().max(80).nullish(),
  model: z.string().trim().max(160).nullish(),
}).strict()

export const careerAgentSaveToInterviewSchema = z.object({
  kind: z.enum(['KNOWLEDGE', 'QUESTION_ASK', 'ROLE_POINT']),
  title: z.string().trim().min(1).max(120),
}).strict()

export type CareerAgentConversationCreateInput = z.infer<typeof careerAgentConversationCreateSchema>
export type CareerAgentStoredMessageInput = z.infer<typeof careerAgentStoredMessageSchema>
export type CareerAgentSaveToInterviewInput = z.infer<typeof careerAgentSaveToInterviewSchema>
