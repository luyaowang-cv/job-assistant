import { createHmac, timingSafeEqual } from 'node:crypto'
import { DocumentMutationType, type Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { VariantSuggestionPreviewInput } from '../schemas/resume-variant-suggestion'
import { modelVariantSuggestionsSchema } from '../schemas/resume-variant-suggestion'
import { getLocalUser } from './local-user'
import { AiWorkflowError, callStructuredAi } from './openai-compatible-json.service'

type Suggestion = { suggestionId: string, cardId: string, sourceVariantId: string, sourceContent: string, content: string, evidence: string[], warnings: string[] }
type Token = { resumeId: string, suggestions: Suggestion[], exp: number }
const secret = () => process.env.DOCUMENT_PREVIEW_SECRET || 'local-f024-ai-preview-secret'
const sign = (p: Token) => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return `${b}.${createHmac('sha256', secret()).update(b).digest('base64url')}` }
function verify(token: string) {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = createHmac('sha256', secret()).update(body).digest(), actual = Buffer.from(signature, 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Token
  return payload.exp > Date.now() ? payload : null
}
export class ResumeSuggestionError extends Error { constructor(message: string, readonly code: string, readonly statusCode: number) { super(message) } }

const numericFacts = (value: string) => new Set(value.match(/\d+(?:\.\d+)?%?/g) ?? [])
function hasInventedNumber(source: string, rewritten: string) {
  const allowed = numericFacts(source)
  return [...numericFacts(rewritten)].some(value => !allowed.has(value))
}

export async function previewResumeVariantSuggestions(resumeId: string, input: VariantSuggestionPreviewInput) {
  const user = await getLocalUser()
  const [resume, application, cards] = await Promise.all([
    prisma.resume.findFirst({ where: { id: resumeId, userId: user.id } }),
    prisma.application.findFirst({ where: { id: input.applicationId, userId: user.id, deletedAt: null }, include: { job: { include: { company: true } } } }),
    prisma.materialCard.findMany({ where: { userId: user.id, archivedAt: null, id: { in: input.references.map(x => x.cardId) } }, include: { variants: true } }),
  ])
  if (!resume) throw new ResumeSuggestionError('简历不存在。', 'RESUME_NOT_FOUND', 404)
  if (!application) throw new ResumeSuggestionError('岗位不存在。', 'APPLICATION_NOT_FOUND', 404)
  if (!application.job.description?.trim()) throw new ResumeSuggestionError('所选岗位没有 JD。', 'JOB_DESCRIPTION_REQUIRED', 422)
  if (cards.length !== new Set(input.references.map(x => x.cardId)).size) throw new ResumeSuggestionError('存在无效素材引用。', 'INVALID_DOCUMENT_REFERENCE', 400)
  const selected = input.references.map((ref) => {
    const card = cards.find(x => x.id === ref.cardId)!, variant = card.variants.find(x => x.id === ref.variantId)
    if (!variant) throw new ResumeSuggestionError('文案版本不属于对应素材。', 'INVALID_DOCUMENT_REFERENCE', 400)
    return { cardId: card.id, title: card.title, type: card.type, facts: card.facts, sourceVariantId: variant.id, content: variant.content }
  })
  let generated
  try {
    generated = await callStructuredAi({
      system: '你是简历素材卡片改写 Agent。只能重组、压缩和润色所给卡片中的既有事实。不得新增公司、角色、项目、技术、日期、数字、比例或成果。每个输入 cardId 必须恰好返回一次，输出中文 JSON。',
      task: '根据岗位 JD 对所选素材逐张改写，使职责和成果表达更匹配岗位；保留事实边界。suggestions 每项只含 cardId、content、evidence、warnings；evidence 至少一条，指出使用了哪条原始事实或 JD 要求。',
      payload: { application: { companyName: application.job.company.name, jobTitle: application.job.title, jobDescription: application.job.description }, cards: selected.map(({ sourceVariantId: _sourceVariantId, ...item }) => item) },
      schema: modelVariantSuggestionsSchema,
    })
  }
  catch (error) {
    if (error instanceof AiWorkflowError) throw new ResumeSuggestionError(error.message, error.code, error.statusCode)
    throw error
  }
  const byCard = new Map(generated.data.suggestions.map(item => [item.cardId, item]))
  if (byCard.size !== selected.length || selected.some(item => !byCard.has(item.cardId))) throw new ResumeSuggestionError('AI 返回的卡片集合与请求不一致，请重试。', 'AI_PROVIDER_INVALID_RESPONSE', 502)
  const suggestions = selected.map((item, index) => {
    const suggestion = byCard.get(item.cardId)!
    const sourceFacts = `${item.content}\n${JSON.stringify(item.facts)}`
    if (hasInventedNumber(sourceFacts, suggestion.content)) throw new ResumeSuggestionError('AI 改写加入了原素材中不存在的数字事实，已拒绝本次结果。', 'AI_UNGROUNDED_SUGGESTION', 422)
    return { suggestionId: `${item.cardId}:${index}`, cardId: item.cardId, sourceVariantId: item.sourceVariantId, sourceContent: item.content, content: suggestion.content, evidence: suggestion.evidence, warnings: suggestion.warnings }
  })
  const payload: Token = { resumeId, suggestions, exp: Date.now() + 10 * 60_000 }
  return { suggestions, previewToken: sign(payload), provider: generated.provider, model: generated.model, application: { id: application.id, title: application.job.title, company: application.job.company.name } }
}

export async function confirmResumeVariantSuggestions(resumeId: string, token: string, selectedIds: string[], idempotencyKey: string) {
  const user = await getLocalUser()
  const existing = await prisma.documentMutationEvent.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } } })
  if (existing) return { replayed: true, results: (existing.payload as { results?: unknown[] } | null)?.results ?? [] }
  const payload = verify(token)
  if (!payload || payload.resumeId !== resumeId) return null
  const selected = payload.suggestions.filter(item => selectedIds.includes(item.suggestionId))
  if (selected.length !== new Set(selectedIds).size) return null
  const cards = await prisma.materialCard.findMany({ where: { userId: user.id, archivedAt: null, id: { in: selected.map(x => x.cardId) } }, include: { variants: true } })
  if (cards.length !== selected.length || selected.some(item => !cards.find(card => card.id === item.cardId)?.variants.some(variant => variant.id === item.sourceVariantId))) return null
  return prisma.$transaction(async tx => {
    const results = []
    for (const item of selected) {
      const variant = await tx.materialCardVariant.create({ data: { cardId: item.cardId, name: `岗位适配 ${new Date().toLocaleDateString('zh-CN')}`, content: item.content } })
      await tx.documentMutationEvent.create({ data: { userId: user.id, type: DocumentMutationType.MATERIAL_VARIANT_CREATED, entityType: 'MaterialCardVariant', entityId: variant.id, source: 'AI_USER_CONFIRMED', payload: { cardId: item.cardId, sourceVariantId: item.sourceVariantId, warnings: item.warnings } as Prisma.InputJsonValue } })
      results.push({ suggestionId: item.suggestionId, cardId: item.cardId, variantId: variant.id })
    }
    await tx.documentMutationEvent.create({ data: { userId: user.id, type: DocumentMutationType.DOCUMENT_SYNCED, entityType: 'Resume', entityId: resumeId, source: 'AI_USER_CONFIRMED', idempotencyKey, payload: { results } as Prisma.InputJsonValue } })
    return { replayed: false, results }
  })
}
