import { z } from 'zod'

const allowedBaseUrl = (value: string) => {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  }
  catch {
    return false
  }
}

export const aiProviderSettingSchema = z.object({
  provider: z.literal('OPENAI_COMPATIBLE'),
  baseUrl: z.string().trim().url().max(500).refine(allowedBaseUrl, '仅允许 HTTPS 地址或本地 HTTP 地址。'),
  model: z.string().trim().min(1).max(160),
}).strict()

export type AiProviderSettingInput = z.infer<typeof aiProviderSettingSchema>
