import { DocumentMutationType, ResumeVersionType } from '../generated/prisma/client'
import type { Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { CompositionInput, CreateApplicationProfileVersionInput } from '../schemas/document-composition'
import { getLocalUser } from './local-user'
import { resolveDocument } from './document-resolver'

const json = (value: unknown) => value as Prisma.InputJsonValue
const compositionInclude = {
  references: { include: { card: true, variant: true }, orderBy: [{ section: 'asc' as const }, { sortOrder: 'asc' as const }] },
}

async function validateReferences(userId: string, composition: CompositionInput) {
  const ids = [...new Set(composition.references.map(reference => reference.cardId))]
  const cards = await prisma.materialCard.findMany({
    where: { id: { in: ids }, userId, archivedAt: null },
    include: { variants: true },
  })
  if (cards.length !== ids.length) return null
  const byId = new Map(cards.map(card => [card.id, card]))
  for (const reference of composition.references) {
    if (!byId.get(reference.cardId)?.variants.some(variant => variant.id === reference.variantId)) return null
  }
  return cards
}

function referenceCreates(composition: CompositionInput) {
  return composition.references.map(reference => ({
    cardId: reference.cardId, variantId: reference.variantId, section: reference.section,
    fieldKey: reference.fieldKey ?? null, sortOrder: reference.sortOrder, visible: reference.visible,
    renderRules: json(reference.renderRules),
  }))
}

export async function resolveResumeVersion(resumeId: string, versionId: string) {
  const user = await getLocalUser()
  const version = await prisma.resumeVersion.findFirst({
    where: { id: versionId, resumeId, resume: { userId: user.id } },
    include: { composition: { include: compositionInclude } },
  })
  if (!version) return null
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id } })
  const references = version.composition?.references ?? []
  return {
    version,
    resolved: resolveDocument({
      basics: (profile?.basics ?? {}) as Record<string, unknown>,
      educations: (profile?.educations ?? []) as unknown[],
      fieldVisibility: (version.composition?.fieldVisibility ?? {}) as Record<string, boolean>,
      references,
      legacyContent: version.composition ? undefined : version.content,
    }),
  }
}

export async function resolveResumeDraft(resumeId: string, composition: CompositionInput) {
  const user = await getLocalUser()
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId: user.id } })
  if (!resume || !await validateReferences(user.id, composition)) return null
  const [profile, variants] = await Promise.all([
    prisma.personalProfile.findUnique({ where: { userId: user.id } }),
    prisma.materialCardVariant.findMany({ where: { id: { in: composition.references.map(item => item.variantId) } }, include: { card: true } }),
  ])
  const byId = new Map(variants.map(variant => [variant.id, variant]))
  return {
    resume,
    profile,
    resolved: resolveDocument({
      basics: (profile?.basics ?? {}) as Record<string, unknown>,
      educations: (profile?.educations ?? []) as unknown[],
      fieldVisibility: composition.fieldVisibility,
      references: composition.references.map(reference => ({ ...reference, card: byId.get(reference.variantId)!.card, variant: byId.get(reference.variantId)! })),
    }),
  }
}

export async function createComposedResumeVersion(resumeId: string, composition: CompositionInput, name?: string) {
  const user = await getLocalUser()
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId: user.id } })
  if (!resume || !await validateReferences(user.id, composition)) return null
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id } })
  const variants = await prisma.materialCardVariant.findMany({ where: { id: { in: composition.references.map(item => item.variantId) } }, include: { card: true } })
  const byId = new Map(variants.map(variant => [variant.id, variant]))
  const resolved = resolveDocument({
    basics: (profile?.basics ?? {}) as Record<string, unknown>,
    educations: (profile?.educations ?? []) as unknown[],
    fieldVisibility: composition.fieldVisibility,
    references: composition.references.map(reference => ({ ...reference, card: byId.get(reference.variantId)!.card, variant: byId.get(reference.variantId)! })),
  })
  const content = resolved.references.map(item => `## ${item.title}\n\n${item.content}`).join('\n\n')
  return prisma.$transaction(async (tx) => {
    if (name) await tx.resume.update({ where: { id: resume.id }, data: { name } })
    const version = await tx.resumeVersion.create({ data: {
      resumeId: resume.id, type: ResumeVersionType.TARGETED, content: content || '组合简历（暂无素材）',
      provider: 'MANUAL', model: 'composed-document-v1',
      composition: { create: {
        fieldVisibility: json(composition.fieldVisibility), config: json(composition.config),
        references: { create: referenceCreates(composition) },
      } },
    }, include: { composition: { include: compositionInclude } } })
    const event = await tx.documentMutationEvent.create({ data: {
      userId: user.id, type: DocumentMutationType.RESUME_VERSION_CREATED, entityType: 'ResumeVersion', entityId: version.id,
      payload: json({ resumeId: resume.id, referenceCount: composition.references.length }),
    } })
    return { version, eventId: event.id }
  })
}

export async function listApplicationProfileVersions(profileId: string) {
  const user = await getLocalUser()
  const profile = await prisma.applicationProfile.findFirst({ where: { id: profileId, userId: user.id } })
  if (!profile) return null
  return prisma.applicationProfileVersion.findMany({
    where: { applicationProfileId: profileId }, include: { composition: { include: compositionInclude } }, orderBy: { createdAt: 'desc' },
  })
}

export async function createApplicationProfileVersion(profileId: string, input: CreateApplicationProfileVersionInput) {
  const user = await getLocalUser()
  const profile = await prisma.applicationProfile.findFirst({ where: { id: profileId, userId: user.id } })
  if (!profile || !await validateReferences(user.id, input.composition)) return null
  return prisma.$transaction(async (tx) => {
    const version = await tx.applicationProfileVersion.create({ data: {
      applicationProfileId: profileId, blocks: json(input.blocks), source: 'MANUAL',
      composition: { create: {
        fieldVisibility: json(input.composition.fieldVisibility), config: json(input.composition.config),
        references: { create: referenceCreates(input.composition) },
      } },
    }, include: { composition: { include: compositionInclude } } })
    await tx.applicationProfile.update({ where: { id: profileId }, data: { currentVersionId: version.id } })
    const event = await tx.documentMutationEvent.create({ data: {
      userId: user.id, type: DocumentMutationType.PROFILE_VERSION_CREATED, entityType: 'ApplicationProfileVersion', entityId: version.id,
      payload: json({ profileId, referenceCount: input.composition.references.length }),
    } })
    return { version, eventId: event.id }
  })
}

export async function resolveApplicationProfileVersion(profileId: string, versionId: string) {
  const user = await getLocalUser()
  const version = await prisma.applicationProfileVersion.findFirst({
    where: { id: versionId, applicationProfileId: profileId, applicationProfile: { userId: user.id } },
    include: { composition: { include: compositionInclude } },
  })
  if (!version) return null
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id } })
  return {
    version,
    resolved: resolveDocument({
      basics: (profile?.basics ?? {}) as Record<string, unknown>,
      educations: (profile?.educations ?? []) as unknown[],
      fieldVisibility: (version.composition?.fieldVisibility ?? {}) as Record<string, boolean>,
      references: version.composition?.references ?? [],
      blocks: (version.blocks ?? []) as Parameters<typeof resolveDocument>[0]['blocks'],
    }),
  }
}
