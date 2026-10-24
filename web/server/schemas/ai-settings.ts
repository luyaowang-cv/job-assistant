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
  // 可选：用户自带 API Key（服务端加密存储，接口不返回明文）。省略表示保留原值；空字符串表示清除。
  apiKey: z.string().trim().max(500).optional(),
}).strict()

export type AiProviderSettingInput = z.infer<typeof aiProviderSettingSchema>

/**
 * The connection test accepts the values currently in the form, so a correction
 * can be verified before it is saved. Every field is optional: omitting one means
 * "use what is stored".
 */
export const aiProviderTestSchema = z.object({
  baseUrl: z.string().trim().url().max(500).refine(allowedBaseUrl, '仅允许 HTTPS 地址或本地 HTTP 地址。').optional(),
  model: z.string().trim().min(1).max(160).optional(),
  apiKey: z.string().trim().max(500).optional(),
}).strict()

export type AiProviderTestInput = z.infer<typeof aiProviderTestSchema>
