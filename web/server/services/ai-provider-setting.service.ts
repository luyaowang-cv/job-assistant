import { prisma } from '../lib/prisma'
import type { AiProviderSettingInput } from '../schemas/ai-settings'

import { getLocalUser } from './local-user'

const DEFAULT_SETTING = {
  provider: 'OPENAI_COMPATIBLE',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
} as const

const publicSelect = {
  provider: true,
  baseUrl: true,
  model: true,
} as const

type StoredSetting = {
  provider: string
  baseUrl: string
  model: string
}

function apiKey(setting: Pick<StoredSetting, 'baseUrl'>) {
  const isDeepSeek = (() => {
    try { return new URL(setting.baseUrl).hostname.endsWith('deepseek.com') }
    catch { return false }
  })()
  const generic = process.env.AI_API_KEY?.trim() ?? ''
  return isDeepSeek
    ? process.env.DEEPSEEK_API_KEY?.trim() || generic
    : process.env.OPENAI_API_KEY?.trim() || generic
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
  const user = await getLocalUser()
  const setting = await prisma.aiProviderSetting.findUnique({ where: { userId: user.id }, select: publicSelect })
  return toPublic(setting ?? DEFAULT_SETTING)
}

export async function saveAiProviderSetting(input: AiProviderSettingInput) {
  const user = await getLocalUser()
  const setting = await prisma.aiProviderSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...input },
    update: input,
    select: publicSelect,
  })
  return toPublic(setting)
}

/** Internal-only runtime configuration for Provider Adapters. Never return this from an API route. */
export async function getAiProviderRuntime() {
  const user = await getLocalUser()
  const setting = await prisma.aiProviderSetting.findUnique({ where: { userId: user.id }, select: publicSelect })
  return {
    ...toPublic(setting ?? DEFAULT_SETTING),
    apiKey: apiKey(setting ?? DEFAULT_SETTING),
  }
}
