import { baseUrlHint, chatCompletionsUrl, explainProviderFailure } from '../lib/ai-endpoint'
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

/** What the settings page shows after a connection test. Never contains the key. */
export type AiProviderTestResult = {
  ok: boolean
  /** The URL that was actually requested — the whole point of the button. */
  url: string
  model: string
  status: number
  elapsedMs: number
  message: string
  hint: string
}

const TEST_TIMEOUT_MS = 15_000
/** Enough to prove the key, the address and the model are accepted; costs ~1 token. */
const TEST_MAX_TOKENS = 1

/**
 * Sends one minimal chat completion with the configuration in the form.
 *
 * Values typed into the form win over what is stored, so a correction can be
 * verified before it is saved. A key typed into the form is used for this request
 * only and is not persisted — saving is a separate, explicit action.
 *
 * Everything that can go wrong is reported as data, not thrown: the page needs to
 * show the status, the requested URL and the upstream's own words, and a stack
 * trace through Nitro would replace all three with "500".
 */
export async function testAiProviderConnection(input: { baseUrl?: string, model?: string, apiKey?: string }): Promise<AiProviderTestResult> {
  const user = await getCurrentUser()
  const setting = await prisma.aiProviderSetting.findUnique({ where: { userId: user.id }, select: publicSelect })
  const resolved = setting ?? DEFAULT_SETTING

  const baseUrl = input.baseUrl?.trim() || resolved.baseUrl
  const model = input.model?.trim() || resolved.model
  const url = chatCompletionsUrl(baseUrl)
  const typedKey = input.apiKey?.trim()
  const key = typedKey || apiKey(resolved)

  if (!key) {
    return { ok: false, url, model, status: 0, elapsedMs: 0, message: '没有可用的 API Key。', hint: '在下面填一个再点保存；服务端环境变量也可以，但需要管理员配置。' }
  }

  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: TEST_MAX_TOKENS, messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
  }
  catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return {
      ok: false,
      url,
      model,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      message: timedOut ? `${Math.round(TEST_TIMEOUT_MS / 1_000)} 秒内没有响应。` : '连不上这个地址。',
      hint: timedOut ? '地址可能不对，或服务商当前不可用。' : '检查地址是否写错、是否需要代理，以及该域名是否允许服务器访问。',
    }
  }

  const bodyText = await response.text().catch(() => '')
  const elapsedMs = Date.now() - startedAt
  // The address hint wins over the status hint: when the URL itself is wrong, the
  // status code describes a request that was never going to work, and saying
  // "check the Base URL" shortens the hunt more than "HTTP 404" does.
  const addressHint = baseUrlHint(baseUrl)
  if (response.ok) {
    return { ok: true, url, model, status: response.status, elapsedMs, message: `连接成功（HTTP ${response.status}）。`, hint: addressHint }
  }
  const failure = explainProviderFailure(response.status, bodyText)
  return { ok: false, url, model, status: response.status, elapsedMs, message: failure.message, hint: addressHint || failure.hint }
}
