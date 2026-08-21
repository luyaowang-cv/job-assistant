import { DocumentMutationType, ResumeVersionType } from '../generated/prisma/client'
import type { Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { ApplicationProfileInput, ApplicationStrategy } from '../schemas/application-profile'
import type { CommonBasics, Education } from '../schemas/personal-profile'

import { getLocalUser } from './local-user'
import { resolveBasics, resolveEducations } from './application-profile-resolution'
import { resolveApplicationProfileVersion } from './document-composition.service'

const asJson = (value: unknown) => value as Prisma.InputJsonValue
const publicProfileSelect = {
  id: true,
  name: true,
  targetTags: true,
  strategy: true,
  resumeVersionId: true,
  currentVersionId: true,
  basics: true,
  educations: true,
  workExperiences: true,
  projects: true,
  skills: true,
  languages: true,
  certificates: true,
  campusExperiences: true,
  awards: true,
} satisfies Prisma.ApplicationProfileSelect

type ResumeVersionSummary = { id: string, type: string, content: string }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function buildFillContexts(profile: Awaited<ReturnType<typeof resolveProfile>>, resumeVersion: ResumeVersionSummary | null) {
  const basics = asRecord(profile.basics)
  const strategy = asRecord(profile.strategy) as ApplicationStrategy
  const candidateContext = {
    basics,
    educations: profile.educations,
    strategy,
    workExperiences: profile.workExperiences,
    projects: profile.projects,
    skills: profile.skills,
    languages: profile.languages,
    certificates: profile.certificates,
    campusExperiences: profile.campusExperiences,
    awards: profile.awards,
    resumeVersion: resumeVersion ? { id: resumeVersion.id, type: resumeVersion.type } : null,
  }
  const aiContext = {
    ...candidateContext,
    educations: profile.educations,
    strategy,
    resumeVersion: resumeVersion ? { id: resumeVersion.id, type: resumeVersion.type, content: resumeVersion.content } : null,
  }
  return { localFacts: candidateContext, aiContext }
}

async function resolveProfile(userId: string, profile: Prisma.ApplicationProfileGetPayload<{ select: typeof publicProfileSelect }>) {
  const common = await prisma.personalProfile.findUnique({ where: { userId }, select: { basics: true, educations: true } })
  return {
    ...profile,
    basics: resolveBasics((common?.basics ?? {}) as CommonBasics, profile.basics as CommonBasics),
    educations: resolveEducations((common?.educations ?? []) as Education[], profile.educations as Education[]),
  }
}

export async function listApplicationProfiles() {
  const user = await getLocalUser()
  const profiles = await prisma.applicationProfile.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, select: publicProfileSelect })
  return Promise.all(profiles.map(profile => resolveProfile(user.id, profile)))
}

export async function getApplicationProfileFillContext(profileId: string) {
  const user = await getLocalUser()
  const profile = await prisma.applicationProfile.findFirst({ where: { id: profileId, userId: user.id }, select: publicProfileSelect })
  if (!profile) return null
  const resolved = await resolveProfile(user.id, profile)
  const resumeVersion = profile.resumeVersionId
    ? await prisma.resumeVersion.findFirst({ where: { id: profile.resumeVersionId, resume: { userId: user.id } }, select: { id: true, type: true, content: true } })
    : await prisma.resumeVersion.findFirst({ where: { type: ResumeVersionType.BASE, resume: { userId: user.id } }, select: { id: true, type: true, content: true }, orderBy: { createdAt: 'desc' } })
  const currentVersionId = await prisma.applicationProfile.findFirst({
    where: { id: profileId, userId: user.id },
    select: { currentVersionId: true },
  }).then(value => value?.currentVersionId)
  if (currentVersionId) {
    const composed = await resolveApplicationProfileVersion(profileId, currentVersionId)
    if (composed) {
      return {
        profileName: profile.name,
        localFacts: {
          basics: composed.resolved.basics,
          educations: composed.resolved.educations,
          strategy: asRecord(resolved.strategy),
          workExperiences: resolved.workExperiences,
          projects: resolved.projects,
          skills: resolved.skills,
          languages: resolved.languages,
          certificates: resolved.certificates,
          campusExperiences: resolved.campusExperiences,
          awards: resolved.awards,
          blocks: composed.resolved.blocks,
          references: composed.resolved.references,
          resumeVersion: resumeVersion ? { id: resumeVersion.id, type: resumeVersion.type } : null,
        },
        aiContext: {
          ...composed.resolved,
          strategy: asRecord(resolved.strategy),
          workExperiences: resolved.workExperiences,
          projects: resolved.projects,
          skills: resolved.skills,
          languages: resolved.languages,
          certificates: resolved.certificates,
          campusExperiences: resolved.campusExperiences,
          awards: resolved.awards,
          resumeVersion: resumeVersion ? { id: resumeVersion.id, type: resumeVersion.type, content: resumeVersion.content } : null,
        },
      }
    }
  }
  return { profileName: profile.name, ...buildFillContexts(resolved, resumeVersion) }
}

async function resolveResumeVersionId(userId: string, resumeVersionId: string | null | undefined) {
  if (!resumeVersionId) return null
  const version = await prisma.resumeVersion.findFirst({ where: { id: resumeVersionId, resume: { userId } }, select: { id: true } })
  return version?.id ?? undefined
}

export async function createApplicationProfile(input: ApplicationProfileInput) {
  const user = await getLocalUser()
  const duplicate = await prisma.applicationProfile.findFirst({ where: { userId: user.id, name: input.name } })
  if (duplicate) return { profile: null, duplicateName: true }
  const resumeVersionId = await resolveResumeVersionId(user.id, input.resumeVersionId)
  if (resumeVersionId === undefined) return { profile: null, duplicateName: false, invalidResumeVersion: true }
  const data = {
    name: input.name,
    targetTags: input.targetTags,
    strategy: asJson(input.strategy),
    resumeVersionId,
    basics: asJson(input.basics ?? {}),
    educations: asJson(input.educations ?? []),
    workExperiences: asJson(input.workExperiences ?? []),
    projects: asJson(input.projects ?? []),
    skills: asJson(input.skills ?? []),
    languages: asJson(input.languages ?? []),
    certificates: asJson(input.certificates ?? []),
    campusExperiences: asJson(input.campusExperiences ?? []),
    awards: asJson(input.awards ?? []),
  }
  const profile = await prisma.applicationProfile.create({ data: { userId: user.id, ...data }, select: publicProfileSelect })
  return { profile: await resolveProfile(user.id, profile), duplicateName: false, invalidResumeVersion: false }
}

export async function updateApplicationProfile(profileId: string, input: ApplicationProfileInput) {
  const user = await getLocalUser()
  const current = await prisma.applicationProfile.findFirst({ where: { id: profileId, userId: user.id }, select: { id: true } })
  if (!current) return { profile: null, duplicateName: false, invalidResumeVersion: false }
  const duplicate = await prisma.applicationProfile.findFirst({ where: { userId: user.id, name: input.name, id: { not: current.id } } })
  if (duplicate) return { profile: null, duplicateName: true, invalidResumeVersion: false }
  const resumeVersionId = await resolveResumeVersionId(user.id, input.resumeVersionId)
  if (resumeVersionId === undefined) return { profile: null, duplicateName: false, invalidResumeVersion: true }
  const profile = await prisma.applicationProfile.update({ where: { id: current.id }, data: {
    name: input.name, targetTags: input.targetTags, strategy: asJson(input.strategy), resumeVersionId,
    ...(input.basics === undefined ? {} : { basics: asJson(input.basics) }),
    ...(input.educations === undefined ? {} : { educations: asJson(input.educations) }),
    ...(input.workExperiences === undefined ? {} : { workExperiences: asJson(input.workExperiences) }),
    ...(input.projects === undefined ? {} : { projects: asJson(input.projects) }),
    ...(input.skills === undefined ? {} : { skills: asJson(input.skills) }),
    ...(input.languages === undefined ? {} : { languages: asJson(input.languages) }),
    ...(input.certificates === undefined ? {} : { certificates: asJson(input.certificates) }),
    ...(input.campusExperiences === undefined ? {} : { campusExperiences: asJson(input.campusExperiences) }),
    ...(input.awards === undefined ? {} : { awards: asJson(input.awards) }),
  }, select: publicProfileSelect })
  return { profile: await resolveProfile(user.id, profile), duplicateName: false, invalidResumeVersion: false }
}

export async function deleteApplicationProfile(profileId: string) {
  const user = await getLocalUser()
  const profile = await prisma.applicationProfile.findFirst({ where: { id: profileId, userId: user.id }, select: { id: true, name: true } })
  if (!profile) return null
  return prisma.$transaction(async (tx) => {
    const event = await tx.documentMutationEvent.create({ data: {
      userId: user.id, type: DocumentMutationType.APPLICATION_PROFILE_DELETED, entityType: 'ApplicationProfile', entityId: profileId,
      payload: asJson({ name: profile.name }),
    } })
    const versions = await tx.applicationProfileVersion.findMany({ where: { applicationProfileId: profileId }, select: { id: true } })
    await tx.documentComposition.deleteMany({ where: { applicationProfileVersionId: { in: versions.map(version => version.id) } } })
    await tx.applicationProfileVersion.deleteMany({ where: { applicationProfileId: profileId } })
    const deleted = await tx.applicationProfile.delete({ where: { id: profileId } })
    return { profile: deleted, eventId: event.id }
  })
}
