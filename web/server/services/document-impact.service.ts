import { createHmac, timingSafeEqual } from 'node:crypto'
import { DocumentMutationType } from '../generated/prisma/client'
import type { Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { CompositionInput } from '../schemas/document-composition'
import { createApplicationProfileVersion, createComposedResumeVersion } from './document-composition.service'
import { getLocalUser } from './local-user'

type Target = { id: string, kind: 'RESUME' | 'APPLICATION_PROFILE', currentVersionId: string, title: string, reason: 'DIRECT_REFERENCE' | 'TAG_MATCH' }
type TokenPayload = { cardId: string, variantId: string, mode: 'SYNC' | 'APPEND', targets: Target[], exp: number }
const secret = () => process.env.DOCUMENT_PREVIEW_SECRET || 'local-f023-preview-secret'
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

function sign(payload: TokenPayload) {
  const body = encode(payload)
  const signature = createHmac('sha256', secret()).update(body).digest('base64url')
  return `${body}.${signature}`
}

function verify(token: string): TokenPayload | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = createHmac('sha256', secret()).update(body).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
  return payload.exp > Date.now() ? payload : null
}

export async function previewMaterialImpact(cardId: string, mode: 'SYNC' | 'APPEND', targetTags: string[]) {
  const user = await getLocalUser()
  const card = await prisma.materialCard.findFirst({
    where: { id: cardId, userId: user.id, archivedAt: null },
    include: { variants: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  const latest = card?.variants[0]
  if (!card || !latest) return null
  const targets: Target[] = []
  const resume = await prisma.resume.findUnique({
    where: { userId: user.id },
    include: { versions: { where: { composition: { isNot: null } }, include: { composition: { include: { references: true } } }, orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  const resumeVersion = resume?.versions[0]
  if (resume && resumeVersion?.composition?.references.some(reference => reference.cardId === cardId)) {
    targets.push({ id: `resume:${resume.id}`, kind: 'RESUME', currentVersionId: resumeVersion.id, title: resume.name, reason: 'DIRECT_REFERENCE' })
  }
  const profiles = await prisma.applicationProfile.findMany({
    where: { userId: user.id, currentVersionId: { not: null } },
    include: { currentVersion: { include: { composition: { include: { references: true } } } } },
  })
  for (const profile of profiles) {
    const direct = profile.currentVersion?.composition?.references.some(reference => reference.cardId === cardId)
    const tagMatch = targetTags.length > 0 && targetTags.every(tag => profile.targetTags.includes(tag))
    if ((mode === 'SYNC' && direct) || (mode === 'APPEND' && tagMatch && !direct)) {
      targets.push({ id: `profile:${profile.id}`, kind: 'APPLICATION_PROFILE', currentVersionId: profile.currentVersionId!, title: profile.name, reason: direct ? 'DIRECT_REFERENCE' : 'TAG_MATCH' })
    }
  }
  const limited = targets.slice(0, 50)
  const payload: TokenPayload = { cardId, variantId: latest.id, mode, targets: limited, exp: Date.now() + 10 * 60_000 }
  return {
    card: { id: card.id, title: card.title, latestVariant: latest },
    targets: limited,
    excluded: targets.length > 50 ? [{ reason: 'TARGET_LIMIT', count: targets.length - 50 }] : [],
    previewToken: sign(payload),
  }
}

function cloneComposition(composition: { fieldVisibility: unknown, config: unknown, references: Array<{ cardId: string, variantId: string, section: string, fieldKey: string | null, sortOrder: number, visible: boolean, renderRules: unknown }> }, cardId: string, variantId: string, mode: 'SYNC' | 'APPEND'): CompositionInput {
  const references = composition.references.map(reference => ({
    cardId: reference.cardId,
    variantId: mode === 'SYNC' && reference.cardId === cardId ? variantId : reference.variantId,
    section: reference.section, fieldKey: reference.fieldKey, sortOrder: reference.sortOrder, visible: reference.visible,
    renderRules: reference.renderRules as CompositionInput['references'][number]['renderRules'],
  }))
  if (mode === 'APPEND' && !references.some(reference => reference.cardId === cardId)) {
    references.push({ cardId, variantId, section: 'materials', fieldKey: null, sortOrder: Math.max(-1, ...references.filter(item => item.section === 'materials').map(item => item.sortOrder)) + 1, visible: true, renderRules: { compact: false, hideTechnicalDetails: false } })
  }
  return { fieldVisibility: composition.fieldVisibility as Record<string, boolean>, config: composition.config as Record<string, unknown>, references }
}

export async function confirmMaterialSync(cardId: string, token: string, idempotencyKey: string, targetIds: string[]) {
  const user = await getLocalUser()
  const existing = await prisma.documentMutationEvent.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } } })
  if (existing) return { replayed: true, results: (existing.payload as { results?: unknown[] } | null)?.results ?? [] }
  const payload = verify(token)
  if (!payload || payload.cardId !== cardId) return null
  const allowed = new Map(payload.targets.map(target => [target.id, target]))
  const results: Array<{ targetId: string, status: 'created' | 'skipped' | 'failed', versionId?: string, reason?: string }> = []
  for (const targetId of targetIds) {
    const target = allowed.get(targetId)
    if (!target) { results.push({ targetId, status: 'failed', reason: 'NOT_IN_PREVIEW' }); continue }
    try {
      if (target.kind === 'RESUME') {
        const resumeId = target.id.slice('resume:'.length)
        const version = await prisma.resumeVersion.findFirst({ where: { id: target.currentVersionId, resumeId, resume: { userId: user.id } }, include: { composition: { include: { references: true } } } })
        if (!version?.composition) { results.push({ targetId, status: 'skipped', reason: 'VERSION_CHANGED' }); continue }
        const created = await createComposedResumeVersion(resumeId, cloneComposition(version.composition, cardId, payload.variantId, payload.mode))
        if (!created) { results.push({ targetId, status: 'failed', reason: 'CREATE_FAILED' }); continue }
        results.push({ targetId, status: 'created', versionId: created.version.id })
      } else {
        const profileId = target.id.slice('profile:'.length)
        const profile = await prisma.applicationProfile.findFirst({ where: { id: profileId, userId: user.id, currentVersionId: target.currentVersionId }, include: { currentVersion: { include: { composition: { include: { references: true } } } } } })
        if (!profile?.currentVersion?.composition) { results.push({ targetId, status: 'skipped', reason: 'VERSION_CHANGED' }); continue }
        const created = await createApplicationProfileVersion(profileId, {
          blocks: profile.currentVersion.blocks as never,
          composition: cloneComposition(profile.currentVersion.composition, cardId, payload.variantId, payload.mode),
        })
        if (!created) { results.push({ targetId, status: 'failed', reason: 'CREATE_FAILED' }); continue }
        results.push({ targetId, status: 'created', versionId: created.version.id })
      }
    } catch {
      results.push({ targetId, status: 'failed', reason: 'CREATE_FAILED' })
    }
  }
  await prisma.documentMutationEvent.create({ data: {
    userId: user.id, type: DocumentMutationType.DOCUMENT_SYNCED, entityType: 'MaterialCard', entityId: cardId,
    source: 'USER_CONFIRMATION', idempotencyKey, payload: { results } as Prisma.InputJsonValue,
  } })
  return { replayed: false, results }
}
