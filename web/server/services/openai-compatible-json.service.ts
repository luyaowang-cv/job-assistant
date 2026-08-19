import type { ZodType } from 'zod'

import { getAiProviderRuntime } from './ai-provider-setting.service'

export class AiWorkflowError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message)
  }
}

type Runtime = Awaited<ReturnType<typeof getAiProviderRuntime>>
type Dependencies = { getRuntime?: () => Promise<Runtime>, fetcher?: typeof fetch }

function cleanJson(content: string) {
  return content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

export async function callStructuredAi<T>(input: {
  system: string
  task: string
  payload: unknown
  schema: ZodType<T>
  temperature?: number
  timeoutMs?: number
}, dependencies: Dependencies = {}) {
  const runtime = await (dependencies.getRuntime ?? getAiProviderRuntime)()
  if (!runtime.apiKey) throw new AiWorkflowError('尚未配置当前 Provider 对应的服务端 API Key，请先完成 AI 设置。', 409, 'AI_KEY_NOT_CONFIGURED')

  let response: Response
  try {
    response = await (dependencies.fetcher ?? fetch)(`${runtime.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${runtime.apiKey}` },
      body: JSON.stringify({
        model: runtime.model,
        temperature: input.temperature ?? 0.15,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: JSON.stringify({ task: input.task, payload: input.payload, outputRule: 'Return one JSON object only. Do not use Markdown.' }) },
        ],
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
    })
  }
  catch {
    throw new AiWorkflowError('AI 服务暂时不可用，请检查网络和 API 设置后重试。', 502, 'AI_PROVIDER_UNAVAILABLE')
  }
  if (!response.ok) throw new AiWorkflowError(`AI 服务请求失败（HTTP ${response.status}）。`, 502, 'AI_PROVIDER_ERROR')

  let content = ''
  try {
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    content = body.choices?.[0]?.message?.content ?? ''
  }
  catch { /* mapped to the stable invalid-response error below */ }

  let value: unknown
  try { value = JSON.parse(cleanJson(content)) }
  catch { throw new AiWorkflowError('AI 返回的结构无法识别，请重试。', 502, 'AI_PROVIDER_INVALID_RESPONSE') }
  const parsed = input.schema.safeParse(value)
  if (!parsed.success) throw new AiWorkflowError('AI 返回的结构不符合工作流契约，请重试。', 502, 'AI_PROVIDER_INVALID_RESPONSE')
  return { data: parsed.data, provider: runtime.provider, model: runtime.model }
}
