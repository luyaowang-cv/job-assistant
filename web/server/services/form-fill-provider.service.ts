import { getAiProviderRuntime } from './ai-provider-setting.service'
import { getApplicationProfileFillContext } from './application-profile.service'
import { modelFormFillResponseSchema, type FormFillPreviewInput } from '../schemas/form-fill'

export class FormFillProviderError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message)
  }
}

export async function previewAiFormFill(input: FormFillPreviewInput) {
  const profileContext = await getApplicationProfileFillContext(input.profileId)
  if (!profileContext) throw new FormFillProviderError('所选网申档案不存在或不可访问。', 404, 'PROFILE_NOT_FOUND')

  const runtime = await getAiProviderRuntime()
  if (!runtime.apiKey) throw new FormFillProviderError('尚未配置当前 Provider 对应的服务端 API Key，请先完成 AI 设置。', 409, 'AI_KEY_NOT_CONFIGURED')

  const prompt = JSON.stringify({
    task: 'Fill an online job-application form using only the selected candidate profile. Return JSON only.',
    rules: [
      'Answer every field only when the profile contains a direct or clearly derived fact.',
      'Do not invent facts. Return unresolvedIds for fields without enough evidence.',
      'For select fields, use one of the provided option labels exactly whenever possible.',
      'Use concise values that fit the field. Preserve date formats requested by labels or placeholders.',
    ],
    profile: profileContext.aiContext,
    fields: input.fields,
    output: { fills: [{ fieldId: 'field id from fields', value: 'suggested text' }], unresolvedIds: ['field ids with no answer'] },
  })

  let response: Response
  try {
    response = await fetch(`${runtime.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${runtime.apiKey}` },
      body: JSON.stringify({
        model: runtime.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a precise job-application assistant. Return only the requested JSON object.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })
  }
  catch {
    throw new FormFillProviderError('AI 服务暂时不可用，请检查 API 设置后重试。', 502, 'AI_PROVIDER_UNAVAILABLE')
  }
  if (!response.ok) throw new FormFillProviderError(`AI 服务请求失败（HTTP ${response.status}）。`, 502, 'AI_PROVIDER_ERROR')

  let content = ''
  try {
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    content = body.choices?.[0]?.message?.content?.trim() ?? ''
  }
  catch { /* invalid provider response becomes a recoverable error below */ }
  let modelOutput: unknown
  try { modelOutput = JSON.parse(content || '{}') }
  catch { throw new FormFillProviderError('AI 返回的填写结果无法识别，请重试。', 502, 'AI_PROVIDER_INVALID_RESPONSE') }
  const parsed = modelFormFillResponseSchema.safeParse(modelOutput)
  if (!parsed.success) throw new FormFillProviderError('AI 返回的填写结果无法识别，请重试。', 502, 'AI_PROVIDER_INVALID_RESPONSE')

  const allowedIds = new Set(input.fields.map(field => field.id))
  const fills = Array.from(new Map(parsed.data.fills
    .filter(fill => allowedIds.has(fill.fieldId) && fill.value.trim())
    .map(fill => [fill.fieldId, { fieldId: fill.fieldId, value: fill.value.trim() }])).values())
  const filledIds = new Set(fills.map(fill => fill.fieldId))
  const unresolvedIds = input.fields.map(field => field.id).filter(id => !filledIds.has(id))

  return { fills, unresolvedIds, provider: runtime.provider, model: runtime.model }
}
