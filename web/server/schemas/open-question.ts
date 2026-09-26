import { z } from 'zod'

const messageContent = z.string().trim().min(1).max(4_000)

export const openQuestionMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: messageContent,
}).strict()

/**
 * The client keeps the thread, so the server stays stateless: it receives the
 * exchange so far and returns the next answer. Both caps are what bound the
 * cost of one request — the turn count and the total characters sent upstream.
 */
export const openQuestionAnswerSchema = z.object({
  profileId: z.string().trim().min(1).max(64),
  messages: z.array(openQuestionMessageSchema).min(1).max(24),
}).strict()
  .refine(value => value.messages.at(-1)?.role === 'user', {
    message: '最后一个回合必须是一个问题。',
  })
  .refine(
    value => value.messages.reduce((total, message) => total + message.content.length, 0) <= 12_000,
    { message: '对话过长，请清空后重新开始。' },
  )

export type OpenQuestionMessage = z.infer<typeof openQuestionMessageSchema>
export type OpenQuestionInput = z.infer<typeof openQuestionAnswerSchema>
