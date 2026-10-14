/**
 * Pulling answers out of a model reply while it is still arriving.
 *
 * The whole point of one request per form is that the applicant sees fields land
 * as the model decides them, instead of waiting for the last one. That means two
 * incremental parsers: one for the provider's SSE frames, and one for the JSON
 * the frames are spelling out. Both are pure, both are tested; nothing here knows
 * about HTTP, a model, or a browser.
 */

export type Fill = { fieldId: string, value: string }

/**
 * Splits an accumulated SSE body into the data payloads it holds and the tail
 * that is not a complete frame yet.
 *
 * Frames are separated by a blank line, which is what makes this safe to call on
 * every chunk: a half-written frame stays in `rest` until its terminator arrives.
 * Comment lines (`: keep-alive`) and the `[DONE]` sentinel are dropped — the first
 * carries no data, and the second has no meaning to us because the response body
 * ending is what tells us the reply is over.
 */
export function readSseFrames(buffer: string): { payloads: string[], rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  const payloads: string[] = []
  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      payloads.push(payload)
    }
  }
  return { payloads, rest }
}

/** The text a chunk of a streaming OpenAI-compatible reply carries. */
export function deltaFromPayload(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
    return parsed.choices?.[0]?.delta?.content ?? ''
  }
  catch {
    return ''
  }
}

/**
 * Every complete `{"fieldId": …, "value": …}` object in the text, plus whatever
 * is left once those are taken out.
 *
 * The reply is a JSON document being written left to right, so an object is
 * usable the moment its closing brace arrives — no need to wait for the array, the
 * document, or the answer to be finished. A half-written object stays in `rest`,
 * and a half-written *string* is what the quote/escape tracking is for: a `}` inside
 * an answer is text, not structure.
 */
export function takeFills(buffer: string): { fills: Fill[], rest: string } {
  const fills: Fill[] = []
  let consumedTo = 0
  let index = 0

  while (index < buffer.length) {
    if (buffer[index] !== '{') {
      index += 1
      continue
    }
    const end = endOfObject(buffer, index)
    const parsed = end < 0 ? null : asFill(buffer.slice(index, end + 1))
    if (parsed) {
      fills.push(parsed)
      consumedTo = end + 1
      index = end + 1
      continue
    }
    // Not a usable answer, or not closed yet — but a complete answer may still be
    // nested inside it, which is exactly where the answers live
    // (`{"fills":[{…},{…}]}`). Looking *inside* an unclosed object is what lets the
    // first answer be applied while the rest is still being written.
    index += 1
  }

  return { fills, rest: buffer.slice(consumedTo) }
}

/** The index of the `}` closing the object that starts at `start`, or -1. */
function endOfObject(text: string, start: number) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** One object, if it is a usable answer. Anything else is ignored. */
function asFill(text: string): Fill | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    // Truncated or malformed: it stays out of the results rather than being guessed at.
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  const fieldId = typeof record.fieldId === 'string' ? record.fieldId.trim() : ''
  const value = typeof record.value === 'string' ? record.value.trim() : ''
  if (!fieldId || !value) return null
  return { fieldId, value }
}

// ------------------------------------------------------------------ the stream

export type FillStreamEvent =
  | { type: 'fill', fieldId: string, value: string }
  | { type: 'warning', message: string }
  | { type: 'done', provider: string, model: string }
  | { type: 'error', message: string }

/**
 * The longest an answer may be, matching the schema the batch path validates with.
 * Stated here because this module trims and length-checks without importing a
 * schema that would drag the database layer into a pure parser.
 */
const MAX_VALUE_LENGTH = 4_000

export type FillStreamOptions = {
  provider: string
  model: string
  /** The ids this request actually sent. Anything else is dropped, not written. */
  allowedIds: Set<string>
  /** Answers the deterministic layer already produced, sent before the model's. */
  structured?: Fill[]
  /** Injected for tests; the caller's own reader of the provider's SSE body. */
  source?: ReadableStream<Uint8Array>
}

const ndjson = (payload: FillStreamEvent) => `${JSON.stringify(payload)}\n`

/**
 * Turns the provider's streamed reply into answers as they are written.
 *
 * An answer is handed over the moment its closing brace arrives, so the applicant
 * watches the form fill instead of waiting for a reply that ends — and a reply cut
 * off at the output ceiling still leaves every completed answer applied. Under
 * batching the same cut-off cost the entire batch, plus a retry that truncated in
 * the same place.
 */
export function fillEventStream(options: FillStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // The deterministic answers are sent before the model is read from at all, so
      // they land while it is still thinking.
      const sent = new Set<string>()
      for (const fill of options.structured ?? []) {
        if (sent.has(fill.fieldId)) continue
        sent.add(fill.fieldId)
        controller.enqueue(encoder.encode(ndjson({ type: 'fill', ...fill })))
      }

      upstreamReader = options.source?.getReader() ?? null
      if (!upstreamReader) {
        controller.enqueue(encoder.encode(ndjson({ type: 'done', provider: options.provider, model: options.model })))
        controller.close()
        return
      }

      let sseBuffer = ''
      let text = ''
      let pending = ''
      let finishReason = ''
      try {
        while (true) {
          const { done, value } = await upstreamReader.read()
          sseBuffer += value ? decoder.decode(value, { stream: !done }) : decoder.decode()
          // A trailing blank line makes the last frame readable without waiting for
          // a chunk that will never come.
          const frames = readSseFrames(done ? `${sseBuffer}\n\n` : sseBuffer)
          sseBuffer = frames.rest
          for (const payload of frames.payloads) {
            finishReason = finishReasonOf(payload) || finishReason
            const delta = deltaFromPayload(payload)
            if (!delta) continue
            text += delta
            pending += delta
            const taken = takeFills(pending)
            pending = taken.rest
            for (const fill of taken.fills) {
              if (fill.value.length > MAX_VALUE_LENGTH) continue
              // An answer for a field this request never sent is dropped rather than
              // written into whatever shares its id: ids are positions, and a stale
              // one names a different control.
              if (!options.allowedIds.has(fill.fieldId) || sent.has(fill.fieldId)) continue
              sent.add(fill.fieldId)
              controller.enqueue(encoder.encode(ndjson({ type: 'fill', ...fill })))
            }
          }
          if (done) break
        }

        if (finishReason === 'length') {
          controller.enqueue(encoder.encode(ndjson({
            type: 'warning',
            message: `AI 的输出达到上限，这次已填的 ${sent.size} 项都保留在页面上；剩下没答完的可以再点一次填写。`,
          })))
        }
        if (sent.size === 0 && !text) {
          controller.enqueue(encoder.encode(ndjson({ type: 'error', message: 'AI 没有返回可识别的填写结果，请重新点击填写。' })))
        }
        controller.enqueue(encoder.encode(ndjson({ type: 'done', provider: options.provider, model: options.model })))
      }
      catch {
        // What has already been written stays written; the reader decides what to do.
        controller.enqueue(encoder.encode(ndjson({ type: 'error', message: 'AI 流式连接已中断，已写入的字段保留在页面上。' })))
      }
      finally {
        controller.close()
      }
    },
    async cancel() {
      await upstreamReader?.cancel().catch(() => undefined)
    },
  })
}

/** The `finish_reason` a frame carries, when it carries one. */
function finishReasonOf(payload: string) {
  try {
    const parsed = JSON.parse(payload) as { choices?: Array<{ finish_reason?: string | null }> }
    return parsed.choices?.[0]?.finish_reason ?? ''
  }
  catch {
    return ''
  }
}
