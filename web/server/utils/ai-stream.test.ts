import assert from 'node:assert/strict'
import test from 'node:test'

import { deltaFromPayload, fillEventStream, readSseFrames, takeFills } from './ai-stream'

const frame = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`

test('reads whole SSE frames and keeps the unfinished tail', () => {
  const first = readSseFrames(`${frame('{"fill')}${frame('s":[')}`)
  assert.deepEqual(first.payloads.length, 2)
  assert.equal(first.rest, '')

  // A frame split across two chunks is not read until its blank line arrives.
  const half = readSseFrames(`${frame('a')}data: {"choices":[{"delta":{"con`)
  assert.equal(half.payloads.length, 1)
  assert.match(half.rest, /^data: \{"choices"/)
  const completed = readSseFrames(`${half.rest}tent":"b"}]}]}\n\n`)
  assert.equal(completed.payloads.length, 1)
  assert.equal(completed.rest, '')
})

test('skips keep-alive comments and the DONE sentinel', () => {
  const { payloads } = readSseFrames(`: ping\n\ndata: [DONE]\n\n${frame('x')}\n\n`)
  assert.equal(payloads.length, 1)
  assert.equal(deltaFromPayload(payloads[0]), 'x')
})

test('tolerates a payload that is not JSON', () => {
  assert.equal(deltaFromPayload('not json'), '')
  assert.equal(deltaFromPayload('{"choices":[]}'), '')
})

test('takes an answer the moment its closing brace arrives', () => {
  // The document is being written left to right: the first answer is usable before
  // the array, and the document, are finished.
  const partial = '{"fills":[{"fieldId":"a","value":"北京"},{"fieldId":"b","va'
  const taken = takeFills(partial)
  assert.deepEqual(taken.fills, [{ fieldId: 'a', value: '北京' }])
  // Everything after the last answer is handed back, separator included: the next
  // call starts by looking for a `{`, so a stray comma is noise it ignores.
  assert.equal(taken.rest, ',{"fieldId":"b","va')

  const finished = takeFills(`${taken.rest}lue":"上海"}],"unresolvedIds":[]}`)
  assert.deepEqual(finished.fills, [{ fieldId: 'b', value: '上海' }])
})

test('does not mistake a brace inside an answer for structure', () => {
  const taken = takeFills('{"fills":[{"fieldId":"a","value":"用 { } 表示对象"},{"fieldId":"b","value":"x"}]}')
  assert.deepEqual(taken.fills, [
    { fieldId: 'a', value: '用 { } 表示对象' },
    { fieldId: 'b', value: 'x' },
  ])
})

test('ignores objects that are not answers, and empty ones', () => {
  const taken = takeFills('{"note":"说明","fills":[{"fieldId":"a","value":""},{"value":"没有 id"}]}')
  assert.deepEqual(taken.fills, [])
})

test('survives a brace inside an escaped string', () => {
  const taken = takeFills('{"fieldId":"a","value":"引号\\" 里的 } 花括号"}')
  assert.deepEqual(taken.fills, [{ fieldId: 'a', value: '引号" 里的 } 花括号' }])
})

// ------------------------------------------------------------ the event stream

function sourceOf(frames: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const item of frames) controller.enqueue(encoder.encode(item))
      controller.close()
    },
  })
}

async function drain(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, string>)
}

const options = (over: Partial<Parameters<typeof fillEventStream>[0]> = {}) => ({
  provider: 'OPENAI_COMPATIBLE',
  model: 'test-model',
  allowedIds: new Set(['school', 'major']),
  ...over,
})

test('hands over each answer as its closing brace arrives', async () => {
  const events = await drain(fillEventStream(options({
    source: sourceOf([
      frame('{"fills":[{"fieldId":"school","value":"北方工业大学"},'),
      frame('{"fieldId":"major","va'),
      frame('lue":"物联网工程"}]}'),
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
    ]),
  })))

  assert.deepEqual(events, [
    { type: 'fill', fieldId: 'school', value: '北方工业大学' },
    { type: 'fill', fieldId: 'major', value: '物联网工程' },
    { type: 'done', provider: 'OPENAI_COMPATIBLE', model: 'test-model' },
  ])
})

test('sends the deterministic answers before the model is read from', async () => {
  const events = await drain(fillEventStream(options({
    structured: [{ fieldId: 'name', value: '张三' }],
    // A source that never produces anything: the structured answer must still arrive.
    source: new ReadableStream<Uint8Array>({ start(controller) { controller.close() } }),
  })))

  assert.deepEqual(events, [
    { type: 'fill', fieldId: 'name', value: '张三' },
    { type: 'done', provider: 'OPENAI_COMPATIBLE', model: 'test-model' },
  ])
})

test('keeps what was written when the reply is cut off at the ceiling', async () => {
  const events = await drain(fillEventStream(options({
    source: sourceOf([
      frame('{"fills":[{"fieldId":"school","value":"北方工业大学"},{"fieldId":"major","value":"物联'),
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`,
    ]),
  })))

  // The completed answer is applied; only the unfinished one is lost, and the
  // reader is told why rather than left guessing.
  assert.deepEqual(events.slice(0, 1), [{ type: 'fill', fieldId: 'school', value: '北方工业大学' }])
  assert.equal(events.some(item => item.type === 'warning'), true)
  assert.equal(events.at(-1)?.type, 'done')
})

test('drops an answer for a field this request never sent', async () => {
  const events = await drain(fillEventStream(options({
    source: sourceOf([
      frame('{"fills":[{"fieldId":"form-field-999","value":"别人的格子"},{"fieldId":"school","value":"北方工业大学"}]}'),
      `data: [DONE]\n\n`,
    ]),
  })))

  // Ids are positions, so a stale one names a different control.
  assert.deepEqual(events.filter(item => item.type === 'fill'), [
    { type: 'fill', fieldId: 'school', value: '北方工业大学' },
  ])
})

test('reports a reply that carried nothing usable', async () => {
  const events = await drain(fillEventStream(options({ source: sourceOf(['data: [DONE]\n\n']) })))

  assert.deepEqual(events, [
    { type: 'error', message: 'AI 没有返回可识别的填写结果，请重新点击填写。' },
    { type: 'done', provider: 'OPENAI_COMPATIBLE', model: 'test-model' },
  ])
})

test('answers once per field even if the model repeats itself', async () => {
  const events = await drain(fillEventStream(options({
    source: sourceOf([
      frame('{"fieldId":"school","value":"北方工业大学"}'),
      frame('{"fieldId":"school","value":"另一所学校"}'),
      `data: [DONE]\n\n`,
    ]),
  })))

  assert.deepEqual(events.filter(item => item.type === 'fill'), [
    { type: 'fill', fieldId: 'school', value: '北方工业大学' },
  ])
})
