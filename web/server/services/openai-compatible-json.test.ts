import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
const { AiWorkflowError, callStructuredAi } = await import('./openai-compatible-json.service')
const schema = z.object({ answer: z.string().min(1) }).strict()
const runtime = { provider: 'OPENAI_COMPATIBLE' as const, baseUrl: 'https://model.example/v1', model: 'test-model', apiKeyConfigured: true, apiKey: 'server-only-secret' }

test('calls configured chat completions endpoint and validates fenced JSON', async () => {
  let requestUrl = ''
  let authorization = ''
  const result = await callStructuredAi({ system: 'system', task: 'task', payload: { safe: true }, schema }, {
    getRuntime: async () => runtime,
    fetcher: (async (url, init) => {
      requestUrl = String(url)
      authorization = new Headers(init?.headers).get('authorization') ?? ''
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"answer":"ok"}\n```' } }] }), { status: 200 })
    }) as typeof fetch,
  })
  assert.equal(requestUrl, 'https://model.example/v1/chat/completions')
  assert.equal(authorization, 'Bearer server-only-secret')
  assert.deepEqual(result, { data: { answer: 'ok' }, provider: 'OPENAI_COMPATIBLE', model: 'test-model' })
  assert.equal(JSON.stringify(result).includes('server-only-secret'), false)
})

test('rejects missing keys and invalid model structures without fallback', async () => {
  await assert.rejects(
    callStructuredAi({ system: 's', task: 't', payload: {}, schema }, { getRuntime: async () => ({ ...runtime, apiKey: '', apiKeyConfigured: false }) }),
    (error: unknown) => error instanceof AiWorkflowError && error.code === 'AI_KEY_NOT_CONFIGURED',
  )
  await assert.rejects(
    callStructuredAi({ system: 's', task: 't', payload: {}, schema }, {
      getRuntime: async () => runtime,
      fetcher: (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"wrong":true}' } }] }), { status: 200 })) as typeof fetch,
    }),
    (error: unknown) => error instanceof AiWorkflowError && error.code === 'AI_PROVIDER_INVALID_RESPONSE',
  )
})
