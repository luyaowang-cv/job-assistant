import assert from 'node:assert/strict'
import test from 'node:test'

import { baseUrlHint, chatCompletionsUrl, explainProviderFailure } from './ai-endpoint'

test('拼接地址与扩展端的写法一致：去掉尾部斜杠再补 /chat/completions', () => {
  assert.equal(chatCompletionsUrl('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions')
  assert.equal(chatCompletionsUrl('https://api.deepseek.com///'), 'https://api.deepseek.com/chat/completions')
  assert.equal(chatCompletionsUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/chat/completions')
  // 这就是真机上踩过的那个坑：Anthropic 格式的地址拼出来是一条不存在的路径。
  assert.equal(chatCompletionsUrl('https://api.deepseek.com/anthropic'), 'https://api.deepseek.com/anthropic/chat/completions')
})

test('从地址本身就能看出常见错误', () => {
  assert.match(baseUrlHint('https://api.deepseek.com/anthropic'), /Anthropic 格式/)
  assert.match(baseUrlHint('https://api.deepseek.com/chat/completions'), /不应包含 \/chat\/completions/)
  assert.match(baseUrlHint('https://api.anthropic.com/v1/messages'), /\/messages/)
  assert.match(baseUrlHint(''), /还没有填写/)
  // 正常地址不该提示任何东西
  assert.equal(baseUrlHint('https://api.deepseek.com'), '')
  assert.equal(baseUrlHint('https://api.openai.com/v1'), '')
})

test('失败归因按状态码给出原因，并引用上游原文', () => {
  assert.match(explainProviderFailure(401, '').message, /API Key 无效/)
  assert.match(explainProviderFailure(402, '').message, /余额不足/)
  assert.match(explainProviderFailure(404, '').message, /接口地址不存在/)
  assert.match(explainProviderFailure(404, '').hint, /Base URL/)
  assert.match(explainProviderFailure(429, 'rate limit exceeded').message, /rate limit exceeded/)
  assert.match(explainProviderFailure(500, '').message, /服务商自身故障/)
  assert.match(explainProviderFailure(418, '').message, /HTTP 418/)
})

test('上游正文被压缩并截断，不会把整页 HTML 塞进界面', () => {
  const noisy = `<html>\n  <body>${'x'.repeat(1000)}</body>\n</html>`
  const { message } = explainProviderFailure(404, noisy)
  assert.ok(message.length < 360, `消息太长：${message.length}`)
  assert.doesNotMatch(message, /\n/)
})
