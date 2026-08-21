import { DocumentMutationType, Prisma, ResumeVersionType } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { CreateBaseResumeInput, SaveResumeVersionInput } from '../schemas/resume'

import { getLocalUser } from './local-user'
import { getAiProviderSetting } from './ai-provider-setting.service'

export async function getResume() {
  const user = await getLocalUser()
  return prisma.resume.findUnique({
    where: { userId: user.id },
    include: { versions: { include: { application: { include: { job: { include: { company: true } } } } }, orderBy: { createdAt: 'desc' } } },
  })
}

export async function createBaseResume(input: CreateBaseResumeInput) {
  const user = await getLocalUser()
  const existing = await prisma.resume.findUnique({ where: { userId: user.id } })
  if (existing) return null

  return prisma.resume.create({
    data: {
      userId: user.id,
      name: input.name,
      versions: { create: { name: input.name, type: ResumeVersionType.BASE, content: input.content, provider: 'MANUAL', model: 'manual-base-v1' } },
    },
    include: { versions: true },
  })
}

export async function replaceBaseResume(input: CreateBaseResumeInput) {
  const user = await getLocalUser()
  const resume = await prisma.resume.findUnique({
    where: { userId: user.id },
    include: { versions: { where: { type: ResumeVersionType.BASE }, take: 1 } },
  })
  const baseVersion = resume?.versions[0]
  if (!resume || !baseVersion) return null

  return prisma.$transaction(async (transaction) => {
    await transaction.resume.update({ where: { id: resume.id }, data: { name: input.name } })
    return transaction.resumeVersion.update({
      where: { id: baseVersion.id },
      data: { name: input.name, content: input.content, aiDraft: null, changeSummary: Prisma.JsonNull, wasEdited: false, provider: 'MANUAL', model: 'manual-base-v1' },
    })
  })
}

export async function getResumeOptimizationContext(applicationId: string) {
  const user = await getLocalUser()
  const resume = await getResume()
  if (!resume) return { resume: null, application: null }
  const baseVersion = resume.versions.find(version => version.type === ResumeVersionType.BASE)
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id, deletedAt: null },
    include: { job: { include: { company: true } } },
  })
  return { resume: { ...resume, baseVersion }, application }
}

export async function createTargetedResumeVersion(input: SaveResumeVersionInput) {
  const [user, identity] = await Promise.all([getLocalUser(), getAiProviderSetting()])
  const resume = await prisma.resume.findUnique({ where: { userId: user.id } })
  if (!resume) return null

  if (input.applicationId) {
    const application = await prisma.application.findFirst({ where: { id: input.applicationId, userId: user.id, deletedAt: null } })
    if (!application) return null
  }

  return prisma.resumeVersion.create({
    data: {
      resumeId: resume.id,
      applicationId: input.applicationId ?? null,
      name: input.name,
      type: ResumeVersionType.TARGETED,
      aiDraft: input.aiDraft,
      content: input.content,
      changeSummary: input.changeSummary,
      wasEdited: input.aiDraft !== input.content,
      provider: identity.provider,
      model: identity.model,
    },
  })
}

const json = (value: unknown) => value as Prisma.InputJsonValue

export async function deleteResumeVersion(resumeId: string, versionId: string) {
  const user = await getLocalUser()
  const version = await prisma.resumeVersion.findFirst({
    where: { id: versionId, resumeId, resume: { userId: user.id }, type: ResumeVersionType.TARGETED },
    select: { id: true },
  })
  if (!version) return null
  return prisma.$transaction(async (tx) => {
    const event = await tx.documentMutationEvent.create({ data: {
      userId: user.id, type: DocumentMutationType.RESUME_VERSION_DELETED, entityType: 'ResumeVersion', entityId: versionId,
      payload: json({ resumeId }),
    } })
    await tx.documentComposition.deleteMany({ where: { resumeVersionId: versionId } })
    const deleted = await tx.resumeVersion.delete({ where: { id: versionId } })
    return { version: deleted, eventId: event.id }
  })
}
