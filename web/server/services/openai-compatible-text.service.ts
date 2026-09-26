import type { CareerAgentMessage } from '../schemas/career-agent'

export class AiTextStreamError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message)
  }
}

interface Runtime {
  provider: string
  baseUrl: string
  model: string
  apiKeyConfigured: boolean
  apiKey: string | null
}
type Dependencies = { getRuntime?: () => Promise<Runtime>, fetcher?: typeof fetch }
type StreamEvent =
  | { type: 'delta', text: string }
  | { type: 'done', provider: string, model: string }
  | { type: 'error', message: string }

const line = (event: StreamEvent) => `${JSON.stringify(event)}\n`

function isDeepSeek(baseUrl: string) {
  try { return new URL(baseUrl).hostname.endsWith('deepseek.com') }
  catch { return false }
}

function responseStream(response: Response, runtime: Runtime) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      upstreamReader = response.body?.getReader() ?? null
      if (!upstreamReader) {
        controller.enqueue(encoder.encode(line({ type: 'error', message: 'AI 服务没有返回可读取的内容。' })))
        controller.close()
        return
      }

      let buffer = ''
      let emitted = false
      let finishReason = ''
      try {
        while (true) {
          const { done, value } = await upstreamReader.read()
          buffer += value ? decoder.decode(value, { stream: !done }) : decoder.decode()
          const rows = buffer.split(/\r?\n/)
          buffer = done ? '' : (rows.pop() ?? '')
          for (const row of rows) {
            const payload = row.startsWith('data:') ? row.slice(5).trim() : ''
            if (!payload || payload === '[DONE]') continue
            try {
              const chunk = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string }, finish_reason?: string | null }> }
              const choice = chunk.choices?.[0]
              const text = choice?.delta?.content ?? ''
              finishReason = choice?.finish_reason ?? finishReason
              if (!text) continue
              emitted = true
              controller.enqueue(encoder.encode(line({ type: 'delta', text })))
            }
            catch { /* Ignore provider keep-alive and non-data lines. */ }
          }
          if (done) break
        }

        if (!emitted) controller.enqueue(encoder.encode(line({ type: 'error', message: 'AI 没有生成正文，请重新发送或缩短问题。' })))
        else if (finishReason === 'length') controller.enqueue(encoder.encode(line({ type: 'error', message: '本次回答达到输出上限，可以继续追问“接着说”。' })))
        else if (finishReason === 'content_filter' || finishReason === 'insufficient_system_resource') controller.enqueue(encoder.encode(line({ type: 'error', message: 'AI 服务中断了本次生成，请稍后重试。' })))
        controller.enqueue(encoder.encode(line({ type: 'done', provider: runtime.provider, model: runtime.model })))
      }
      catch {
        controller.enqueue(encoder.encode(line({ type: 'error', message: 'AI 流式连接已中断，请重试。' })))
      }
      finally { controller.close() }
    },
    async cancel() { await upstreamReader?.cancel().catch(() => undefined) },
  })
}

export async function streamTextAi(input: {
  system: string
  messages: CareerAgentMessage[]
  timeoutMs?: number
}, dependencies: Dependencies = {}) {
  const getRuntime = dependencies.getRuntime ?? (async () => {
    const { getAiProviderRuntime } = await import('./ai-provider-setting.service')
    return getAiProviderRuntime()
  })
  const runtime = await getRuntime()
  if (!runtime.apiKey) throw new AiTextStreamError('尚未配置服务端 API Key，请先完成 AI 设置。', 409, 'AI_KEY_NOT_CONFIGURED')

  let response: Response
  try {
    response = await (dependencies.fetcher ?? fetch)(`${runtime.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${runtime.apiKey}` },
      body: JSON.stringify({
        model: runtime.model,
        temperature: 0.3,
        max_tokens: 12_000,
        stream: true,
        ...(isDeepSeek(runtime.baseUrl) ? { thinking: { type: 'disabled' } } : {}),
        messages: [{ role: 'system', content: input.system }, ...input.messages],
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
    })
  }
  catch { throw new AiTextStreamError('AI 服务暂时不可用，请检查网络和 API 设置后重试。', 502, 'AI_PROVIDER_UNAVAILABLE') }

  if (!response.ok) throw new AiTextStreamError(`AI 服务请求失败（HTTP ${response.status}）。`, 502, 'AI_PROVIDER_ERROR')
  return { stream: responseStream(response, runtime), provider: runtime.provider, model: runtime.model }
}
