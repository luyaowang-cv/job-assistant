import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
const { interviewRecordProvider, interviewRecordMockProvider } = await import('./interview-record-provider')

const runtime = { provider: 'OPENAI_COMPATIBLE' as const, baseUrl: 'https://model.example/v1', model: 'test-model', apiKeyConfigured: true, apiKey: 'server-only-secret' }

test('generate calls chat completions and parses prep blocks', async () => {
  let requestUrl = ''
  const result = await interviewRecordProvider.generate({
    companyName: '字节跳动',
    jobTitle: '前端开发工程师',
    jdText: 'JD 描述',
    resumeContent: '简历内容',
    materialCardsDigest: '素材卡片摘要',
  }, {
    getRuntime: async () => runtime,
    fetcher: (async (url, init) => {
      requestUrl = String(url)
      const payload = JSON.parse(String(init?.body))
      assert.equal(payload.model, 'test-model')
      assert.equal(payload.response_format.type, 'json_object')
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([
        { id: 'b1', kind: 'KNOWLEDGE', title: '项目知识点', content: '内容一' },
        { id: 'b2', kind: 'QUESTION_ASK', title: '反问', content: '内容二' },
        { id: 'b3', kind: 'ROLE_POINT', title: '岗位要点', content: '内容三' },
      ]) } }] }), { status: 200 })
    }) as typeof fetch,
  })
  assert.equal(requestUrl, 'https://model.example/v1/chat/completions')
  assert.equal(result.data.length, 3)
  assert.equal(result.data[0].kind, 'KNOWLEDGE')
})

test('extractReview parses extracted structure', async () => {
  const result = await interviewRecordProvider.extractReview({ transcript: '面试录音文字' }, {
    getRuntime: async () => runtime,
    fetcher: (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questionsAsked: ['问题'], strengths: ['亮点'], improvements: ['改进'] }) } }] }), { status: 200 })) as typeof fetch,
  })
  assert.deepEqual(result.data.questionsAsked, ['问题'])
  assert.deepEqual(result.data.strengths, ['亮点'])
})

test('mock provider returns MOCK without any external call', async () => {
  const fetcher = (async () => { throw new Error('must not call external fetch') }) as typeof fetch
  const generated = await interviewRecordMockProvider.generate()
  assert.equal(generated.provider, 'MOCK')
  assert.equal(generated.data.length, 2)
  const extracted = await interviewRecordMockProvider.extractReview()
  assert.equal(extracted.provider, 'MOCK')
  assert.equal(extracted.data.improvements[0], 'Mock 改进')
  assert.doesNotThrow(() => fetcher)
})