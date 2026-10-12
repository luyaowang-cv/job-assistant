import { getAiProviderRuntime } from './ai-provider-setting.service'
import { getApplicationProfileFillContext } from './application-profile.service'
import { buildFillEvidence, buildStructuredFillCandidates } from './form-fill-context'
import { modelFormFillResponseSchema, type FormFillPreviewInput } from '../schemas/form-fill'

export class FormFillProviderError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message)
  }
}

const PROVIDER_TIMEOUT_MS = 60_000

/**
 * The ceiling on one batch's answer, stated rather than inherited.
 *
 * Leaving `max_tokens` unset means the provider's own default decides, and those
 * differ wildly (DeepSeek defaults to 4096, gpt-4o-mini to 16384). A reply cut
 * off mid-JSON parses as invalid and costs the whole batch, so the limit is
 * pinned to a value the extension's batch budget is sized against.
 */
const MAX_FILL_OUTPUT_TOKENS = 4_096

export async function previewAiFormFill(input: FormFillPreviewInput) {
  const profileContext = await getApplicationProfileFillContext(input.profileId)
  if (!profileContext) throw new FormFillProviderError('所选网申档案不存在或不可访问。', 404, 'PROFILE_NOT_FOUND')

  const structuredFills = buildStructuredFillCandidates(profileContext.aiContext, input.fields)
  const structuredIds = new Set(structuredFills.map(fill => fill.fieldId))
  const aiFields = input.fields.filter(field => !structuredIds.has(field.id))

  if (aiFields.length === 0) {
    return { fills: structuredFills, unresolvedIds: [], provider: 'local-profile', model: 'structured-facts' }
  }

  const runtime = await getAiProviderRuntime()
  if (!runtime.apiKey) throw new FormFillProviderError('尚未配置当前 Provider 对应的服务端 API Key，请先完成 AI 设置。', 409, 'AI_KEY_NOT_CONFIGURED')

  const prompt = JSON.stringify({
    task: 'Fill an online job-application form using only the selected candidate profile. Return JSON only.',
    rules: [
      'Use the entire resolved profile, including basics, education, projects, internships, work, campus experience, skills, awards, self-evaluation blocks, strategy, and selected resume content.',
      'Answer every field only when the profile contains a direct or clearly derived fact.',
      'Do not invent facts. Return unresolvedIds for fields without enough evidence.',
      'For select fields, use one of the provided option labels exactly whenever possible.',
      'For repeated experience fields, use label/context/order to select the matching experience and its organization, role, dates, or description.',
      'Do not return a field as unresolved merely because its label repeats. Use page order, same-label occurrence, neighbouring labels, field name, and profile order to map it.',
      'For self-evaluation, prefer a saved self-evaluation; otherwise you may concisely summarize only facts explicitly demonstrated in the profile or resume.',
      'Use complete saved descriptions for textarea fields and concise values for short inputs. Preserve date formats requested by labels or placeholders.',
    ],
    profile: buildFillEvidence(profileContext.aiContext),
    fields: aiFields,
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
        max_tokens: MAX_FILL_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: 'You are a precise job-application assistant. Return only the requested JSON object.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
  }
  catch (error) {
    // A timeout and a dropped connection are both transient, but naming which
    // one happened is what lets a caller decide to wait rather than re-check
    // its own settings.
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new FormFillProviderError(
      timedOut ? 'AI 服务响应超时，请稍后重试。' : 'AI 服务暂时不可用，请检查 API 设置后重试。',
      502,
      timedOut ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE',
    )
  }
  // The upstream status is the only thing that separates a failure worth
  // retrying from one that will fail identically every time: a 429 clears on its
  // own, a rejected key never does. Collapsing them into one 502 left the caller
  // with no way to tell, so they are mapped through here.
  if (!response.ok) {
    const status = response.status
    if (status === 429) {
      throw new FormFillProviderError('AI 服务请求过于频繁（HTTP 429），请稍后重试。', 429, 'AI_PROVIDER_RATE_LIMITED')
    }
    if (status === 401 || status === 403) {
      throw new FormFillProviderError('AI 服务的 API Key 无效或没有权限，请在“AI 设置”中检查。', 502, 'AI_KEY_INVALID')
    }
    if (status >= 500) {
      throw new FormFillProviderError(`AI 服务暂时不可用（HTTP ${status}）。`, 502, 'AI_PROVIDER_UNAVAILABLE')
    }
    throw new FormFillProviderError(`AI 服务拒绝了本次请求（HTTP ${status}）。`, 502, 'AI_PROVIDER_REJECTED')
  }

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

  const allowedIds = new Set(aiFields.map(field => field.id))
  const aiFills = Array.from(new Map(parsed.data.fills
    .filter(fill => allowedIds.has(fill.fieldId) && fill.value.trim())
    .map(fill => [fill.fieldId, { fieldId: fill.fieldId, value: fill.value.trim() }])).values())
  const fills = [...structuredFills, ...aiFills]
  const filledIds = new Set(fills.map(fill => fill.fieldId))
  const unresolvedIds = input.fields.map(field => field.id).filter(id => !filledIds.has(id))

  return { fills, unresolvedIds, provider: runtime.provider, model: runtime.model }
}
