import { decrypt, encrypt } from '../lib/encryption'
import { prisma } from '../lib/prisma'
import type { AiProviderSettingInput } from '../schemas/ai-settings'

import { getCurrentUser } from './current-user'

type StoredSetting = {
  provider: string
  baseUrl: string
  model: string
  apiKeyEnc: string | null
}

const DEFAULT_SETTING: StoredSetting = {
  provider: 'OPENAI_COMPATIBLE',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyEnc: null,
}

const publicSelect = {
  provider: true,
  baseUrl: true,
  model: true,
  apiKeyEnc: true,
} as const

// BYOK 加密密钥：优先 AI_KEY_ENCRYPTION_KEY，缺省回退飞书令牌密钥。未配置返回 null。
function byokKey(): Buffer | null {
  const raw = process.env.AI_KEY_ENCRYPTION_KEY?.trim() || process.env.FEISHU_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) return null
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('AI_KEY_ENCRYPTION_KEY 必须是 32 字节的 Base64 密钥。')
  return key
}

function envApiKey(baseUrl: string) {
  const isDeepSeek = (() => {
    try { return new URL(baseUrl).hostname.endsWith('deepseek.com') }
    catch { return false }
  })()
  const generic = process.env.AI_API_KEY?.trim() ?? ''
  return isDeepSeek
    ? process.env.DEEPSEEK_API_KEY?.trim() || generic
    : process.env.OPENAI_API_KEY?.trim() || generic
}

// 取值顺序（F-042）：优先用户自带的加密 Key，其次回退服务端环境变量。
function apiKey(setting: StoredSetting): string | null {
  if (setting.apiKeyEnc) {
    const key = byokKey()
    return key ? decrypt(setting.apiKeyEnc, key) : null
  }
  return envApiKey(setting.baseUrl)
}

function toPublic(setting: StoredSetting) {
  return {
    provider: 'OPENAI_COMPATIBLE' as const,
    baseUrl: setting.baseUrl,
    model: setting.model,
    apiKeyConfigured: Boolean(apiKey(setting)),
  }
}

export async function getAiProviderSetting() {
  const user = await getCurrentUser()
  const setting = await prisma.aiProviderSetting.findUnique({ where: { userId: user.id }, select: publicSelect })
  return toPublic(setting ?? DEFAULT_SETTING)
}

export async function saveAiProviderSetting(input: AiProviderSettingInput) {
  const user = await getCurrentUser()
  const existing = await prisma.aiProviderSetting.findUnique({ where: { userId: user.id }, select: { apiKeyEnc: true } })

  // 省略 apiKey 时保留原值；空字符串清除；非空则加密存储。
  let apiKeyEnc = existing?.apiKeyEnc ?? null
  if (input.apiKey !== undefined) {
    apiKeyEnc = input.apiKey
      ? encrypt(input.apiKey, (() => { const key = byokKey(); if (!key) throw new Error('缺少加密密钥，无法保存 API Key（请设置 AI_KEY_ENCRYPTION_KEY）。'); return key })())
      : null
  }

  const setting = await prisma.aiProviderSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, provider: input.provider, baseUrl: input.baseUrl, model: input.model, apiKeyEnc },
    update: { provider: input.provider, baseUrl: input.baseUrl, model: input.model, apiKeyEnc },
    select: publicSelect,
  })
  return toPublic(setting)
}

/** Internal-only runtime configuration for Provider Adapters. Never return this from an API route. */
export async function getAiProviderRuntime() {
  const user = await getCurrentUser()
  const setting = await prisma.aiProviderSetting.findUnique({ where: { userId: user.id }, select: publicSelect })
  const resolved = setting ?? DEFAULT_SETTING
  return {
    ...toPublic(resolved),
    apiKey: apiKey(resolved),
  }
}
