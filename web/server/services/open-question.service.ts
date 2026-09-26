import type { OpenQuestionInput } from '../schemas/open-question'

import { getAiProviderRuntime } from './ai-provider-setting.service'
import { getApplicationProfileFillContext } from './application-profile.service'
import { buildFillEvidence } from './form-fill-context'

export class OpenQuestionProviderError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) {
    super(message)
  }
}

/**
 * The profile is the only source of truth. The placeholder rule matters most:
 * a question like “why this company” has no answer in the profile at all, and
 * without it a model will happily invent one — which the applicant would then
 * paste into a real application as a false claim about themselves.
 */
const RULES = [
  '你在帮一位求职者回答网申表单里的开放性问题。',
  '事实依据只有下面这份档案，以及对话中求职者自己补充的内容。',
  '严禁编造档案里没有的学校、公司、职位、项目、数字、奖项或经历。',
  '如果回答必须引用档案里没有的信息（例如公司名、岗位名、具体人名），用【】占位让求职者自己补全，不要猜。',
  '用第一人称写，语气诚恳具体，不要空喊口号。',
  '直接给出可以粘贴进表单的正文，不要写“以下是我的回答”这类引导语。',
  '长度按问题需要，一般 150 到 400 字；问题要求简短时更短。',
].join('\n')

export async function answerOpenQuestion(input: OpenQuestionInput) {
  const profileContext = await getApplicationProfileFillContext(input.profileId)
  if (!profileContext) throw new OpenQuestionProviderError('所选网申档案不存在或不可访问。', 404, 'PROFILE_NOT_FOUND')

  const runtime = await getAiProviderRuntime()
  if (!runtime.apiKey) throw new OpenQuestionProviderError('尚未配置当前 Provider 对应的服务端 API Key，请先完成 AI 设置。', 409, 'AI_KEY_NOT_CONFIGURED')

  const system = `${RULES}\n\n档案：\n${JSON.stringify(buildFillEvidence(profileContext.aiContext))}`

  let response: Response
  try {
    response = await fetch(`${runtime.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${runtime.apiKey}` },
      body: JSON.stringify({
        model: runtime.model,
        // Warmer than the extraction workflows: this is writing, not parsing.
        temperature: 0.4,
        max_tokens: 1_500,
        messages: [{ role: 'system', content: system }, ...input.messages],
      }),
      signal: AbortSignal.timeout(60_000),
    })
  }
  catch {
    throw new OpenQuestionProviderError('AI 服务暂时不可用，请检查网络和 API 设置后重试。', 502, 'AI_PROVIDER_UNAVAILABLE')
  }
  if (!response.ok) throw new OpenQuestionProviderError(`AI 服务请求失败（HTTP ${response.status}）。`, 502, 'AI_PROVIDER_ERROR')

  let content = ''
  try {
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    content = body.choices?.[0]?.message?.content?.trim() ?? ''
  }
  catch { /* mapped to the empty-answer error below */ }
  if (!content) throw new OpenQuestionProviderError('AI 没有给出回答，请换个问法或稍后重试。', 502, 'AI_PROVIDER_EMPTY_RESPONSE')

  return { answer: content, provider: runtime.provider, model: runtime.model }
}
