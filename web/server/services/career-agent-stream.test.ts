import assert from 'node:assert/strict'
import test from 'node:test'
import { careerAgentChatSchema } from '../schemas/career-agent'
import { careerAgentConversationCreateSchema, careerAgentSaveToInterviewSchema, careerAgentStoredMessageSchema } from '../schemas/career-agent-conversation'
import { streamTextAi } from './openai-compatible-text.service'

test('validates lightweight career agent conversations', () => {
  assert.equal(careerAgentChatSchema.safeParse({ applicationId: null, resumeVersionId: null, messages: [{ role: 'user', content: '分析岗位' }] }).success, true)
  assert.equal(careerAgentChatSchema.safeParse({ messages: [{ role: 'assistant', content: '请继续' }] }).success, false)
  assert.equal(careerAgentChatSchema.safeParse({ messages: [{ role: 'user', content: '' }] }).success, false)
})

test('validates persisted conversations and explicit interview saves', () => {
  assert.equal(careerAgentConversationCreateSchema.safeParse({ applicationId: null, resumeVersionId: null }).success, true)
  assert.equal(careerAgentStoredMessageSchema.safeParse({ role: 'assistant', content: '准备内容' }).success, true)
  assert.equal(careerAgentStoredMessageSchema.safeParse({ role: 'system', content: '越权内容' }).success, false)
  assert.equal(careerAgentSaveToInterviewSchema.safeParse({ kind: 'KNOWLEDGE', title: '项目追问' }).success, true)
  assert.equal(careerAgentSaveToInterviewSchema.safeParse({ kind: 'OTHER', title: '无效分类' }).success, false)
})

test('streams free text deltas without requiring model JSON', async () => {
  let requestBody: Record<string, unknown> | null = null
  const encoder = new TextEncoder()
  const fetcher: typeof fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"岗位"},"finish_reason":null}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"分析"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const generated = await streamTextAi({ system: '系统', messages: [{ role: 'user', content: '开始' }] }, {
    getRuntime: async () => ({ provider: 'OPENAI_COMPATIBLE', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro', apiKeyConfigured: true, apiKey: 'test-key' }),
    fetcher,
  })
  const output = await new Response(generated.stream).text()
  const events = output.trim().split('\n').map(value => JSON.parse(value) as { type: string; text?: string })
  assert.deepEqual(events.filter(event => event.type === 'delta').map(event => event.text), ['岗位', '分析'])
  assert.equal(events.at(-1)?.type, 'done')
  assert.equal(requestBody?.stream, true)
  assert.equal('response_format' in (requestBody ?? {}), false)
  assert.deepEqual(requestBody?.thinking, { type: 'disabled' })
})
