import { z } from 'zod'

export const feishuOAuthCallbackSchema = z.object({
  code: z.string().trim().min(1).max(1_024),
  state: z.string().trim().min(1).max(2_048),
})
