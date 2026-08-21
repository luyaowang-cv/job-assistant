import { createHash } from 'node:crypto'
import { MaterialCardType } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import { getLocalUser } from './local-user'
import { createMaterialCard } from './material-card.service'

type Candidate = {
  sourceKey: string
  sourceField: string
  type: MaterialCardType
  title: string
  facts: Record<string, unknown>
  variant: { name: string, content: string }
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function candidate(profileId: string, sourceField: string, index: number, type: MaterialCardType, value: unknown): Candidate | null {
  const item = record(value)
  const scalar = typeof value === 'string' ? value.trim() : ''
  const title = scalar || text(item.name) || text(item.company) || text(item.title)
  const content = scalar || text(item.description) || text(item.detail)
  if (!title && !content) return null
  const sourceKey = createHash('sha256').update(JSON.stringify({ profileId, sourceField, index, value })).digest('hex')
  return {
    sourceKey, sourceField, type, title: title || `${sourceField} ${index + 1}`,
    facts: item, variant: { name: '迁移网申版', content: content || title },
  }
}

export async function previewLegacyMaterialMigration(profileId: string) {
  const user = await getLocalUser()
  const profile = await prisma.applicationProfile.findFirst({ where: { id: profileId, userId: user.id } })
  if (!profile) return null
  const sources: Array<[string, MaterialCardType, unknown[]]> = [
    ['workExperiences', MaterialCardType.WORK, profile.workExperiences as unknown[]],
    ['projects', MaterialCardType.PROJECT, profile.projects as unknown[]],
    ['skills', MaterialCardType.SKILL, profile.skills as unknown[]],
    ['campusExperiences', MaterialCardType.CAMPUS, profile.campusExperiences as unknown[]],
    ['awards', MaterialCardType.AWARD, profile.awards as unknown[]],
    ['certificates', MaterialCardType.CERTIFICATE, profile.certificates as unknown[]],
  ]
  const candidates = sources.flatMap(([field, type, values]) => (Array.isArray(values) ? values : [])
    .map((value, index) => candidate(profileId, field, index, type, value)).filter((value): value is Candidate => Boolean(value)))
  const existing = new Set((await prisma.materialCard.findMany({
    where: { userId: user.id, legacySourceKey: { in: candidates.map(item => item.sourceKey) } },
    select: { legacySourceKey: true },
  })).map(item => item.legacySourceKey))
  return { profileId, candidates: candidates.map(item => ({ ...item, imported: existing.has(item.sourceKey) })) }
}

export async function confirmLegacyMaterialMigration(profileId: string, sourceKeys: string[]) {
  const preview = await previewLegacyMaterialMigration(profileId)
  if (!preview) return null
  const selected = new Set(sourceKeys)
  const results: Array<{ sourceKey: string, status: 'created' | 'skipped' | 'failed', cardId?: string, reason?: string }> = []
  for (const item of preview.candidates.filter(candidate => selected.has(candidate.sourceKey))) {
    if (item.imported) {
      results.push({ sourceKey: item.sourceKey, status: 'skipped', reason: 'ALREADY_IMPORTED' })
      continue
    }
    try {
      const result = await createMaterialCard({
        type: item.type, title: item.title, tags: ['legacy-import'], facts: item.facts, variant: item.variant,
      }, item.sourceKey)
      results.push({ sourceKey: item.sourceKey, status: 'created', cardId: result.card.id })
    } catch {
      results.push({ sourceKey: item.sourceKey, status: 'failed', reason: 'IMPORT_FAILED' })
    }
  }
  for (const key of sourceKeys.filter(key => !preview.candidates.some(candidate => candidate.sourceKey === key))) {
    results.push({ sourceKey: key, status: 'failed', reason: 'UNKNOWN_SOURCE_KEY' })
  }
  return { profileId, results }
}
