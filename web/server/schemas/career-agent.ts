import { z } from 'zod'

export const careerAgentMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(50_000),
}).strict()

export const careerAgentChatSchema = z.object({
  applicationId: z.string().trim().min(1).max(64).nullable().optional(),
  resumeVersionId: z.string().trim().min(1).max(64).nullable().optional(),
  messages: z.array(careerAgentMessageSchema).min(1).max(30),
}).strict().superRefine((value, context) => {
  if (value.messages.at(-1)?.role !== 'user') {
    context.addIssue({ code: 'custom', path: ['messages'], message: 'The last message must be from the user.' })
  }
})

export type CareerAgentChatInput = z.infer<typeof careerAgentChatSchema>
export type CareerAgentMessage = z.infer<typeof careerAgentMessageSchema>
