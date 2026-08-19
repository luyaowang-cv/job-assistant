import assert from 'node:assert/strict'
import test from 'node:test'

import { aiProviderSettingSchema } from './ai-settings'

const valid = { provider: 'OPENAI_COMPATIBLE', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }

test('accepts HTTPS and local OpenAI-compatible base URLs', () => {
  assert.equal(aiProviderSettingSchema.safeParse(valid).success, true)
  assert.equal(aiProviderSettingSchema.safeParse({ ...valid, baseUrl: 'http://127.0.0.1:11434/v1' }).success, true)
})

test('rejects insecure remote URLs and API keys in the request body', () => {
  assert.equal(aiProviderSettingSchema.safeParse({ ...valid, baseUrl: 'http://example.com/v1' }).success, false)
  assert.equal(aiProviderSettingSchema.safeParse({ ...valid, apiKey: 'secret' }).success, false)
})
