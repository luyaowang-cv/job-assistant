import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test'
const { interviewPrepProvider } = await import('./interview-prep-provider')

const runtime = { provider: 'OPENAI_COMPATIBLE' as const, baseUrl: 'https://model.example/v1', model: 'test-model', apiKeyConfigured: true, apiKey: 'server-only-secret' }

test('generate calls chat completions and parses sections', async () => {
  let requestUrl = ''
  const result = await interviewPrepProvider.generate({
    resumeContent: '简历内容',
    resumeLabel: '基础版',
    jdText: 'JD 描述',
    extraText: '实习内容',
  }, {
    getRuntime: async () => runtime,
    fetcher: (async (url, init) => {
      requestUrl = String(url)
      const payload = JSON.parse(String(init?.body))
      assert.equal(payload.model, 'test-model')
      assert.equal(payload.response_format.type, 'json_object')
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify([
        { id: 'intro', title: '自我介绍', content: '内容一' },
        { id: 'jd', title: '岗位与公司认知', content: '内容二' },
        { id: 'qa', title: '高频问题与回答要点', content: '内容三' },
      ]) } }] }), { status: 200 })
    }) as typeof fetch,
  })
  assert.equal(requestUrl, 'https://model.example/v1/chat/completions')
  assert.equal(result.data.length, 3)
  assert.equal(result.data[0].title, '自我介绍')
})

test('extractReflection parses extracted structure', async () => {
  const result = await interviewPrepProvider.extractReflection({ recordText: '面试记录' }, {
    getRuntime: async () => runtime,
    fetcher: (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ keyPoints: ['要点'], questions: ['问题'], weaknesses: [], nextFocus: [] }) } }] }), { status: 200 })) as typeof fetch,
  })
  assert.deepEqual(result.data.keyPoints, ['要点'])
})