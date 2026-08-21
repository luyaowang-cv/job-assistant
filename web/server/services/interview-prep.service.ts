import { DocumentMutationType } from '../generated/prisma/client'
import type { Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import {
  interviewPrepSectionsSchema,
  type InterviewPrepGenerateInput,
  type InterviewPrepSaveInput,
  type InterviewReflectionConfirmInput,
  type InterviewPrepSection,
} from '../schemas/interview-prep'
import { getLocalUser } from './local-user'
import { interviewPrepProvider } from './interview-prep-provider'
import { buildInterviewPrepMarkdown, type InterviewReflectionEntry } from './interview-prep-markdown'
import { getAiProviderSetting } from './ai-provider-setting.service'

type VersionWithApplication = Prisma.ResumeVersionGetPayload<{
  include: { application: { include: { job: { include: { company: true } } } } }
}>

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function versionLabel(version: VersionWithApplication): string {
  return version.name
}

function asReflection(value: Prisma.JsonValue | null | undefined): InterviewReflectionEntry[] {
  if (!Array.isArray(value)) return []
  return value as unknown as InterviewReflectionEntry[]
}

function asSections(value: Prisma.JsonValue | null | undefined): InterviewPrepSection[] {
  const parsed = interviewPrepSectionsSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

async function requireVersion(resumeVersionId: string) {
  const user = await getLocalUser()
  const version = await prisma.resumeVersion.findFirst({
    where: { id: resumeVersionId, resume: { userId: user.id } },
    include: { application: { include: { job: { include: { company: true } } } } },
  })
  return { user, version }
}

export async function getInterviewPrep(resumeVersionId: string) {
  const user = await getLocalUser()
  const version = await prisma.resumeVersion.findFirst({
    where: { id: resumeVersionId, resume: { userId: user.id } },
    select: { id: true },
  })
  if (!version) return null
  return prisma.interviewPrepDocument.findUnique({ where: { resumeVersionId } })
}

export async function generateInterviewPrepPreview(input: InterviewPrepGenerateInput) {
  const { version } = await requireVersion(input.resumeVersionId)
  if (!version) return null
  return interviewPrepProvider.generate({
    resumeContent: version.content,
    resumeLabel: versionLabel(version),
    jdText: input.jdText ?? '',
    extraText: input.extraText ?? '',
  })
}

export async function saveInterviewPrep(input: InterviewPrepSaveInput) {
  const { user, version } = await requireVersion(input.resumeVersionId)
  if (!version) return null
  const identity = await getAiProviderSetting()
  return prisma.$transaction(async (tx) => {
    const saved = await tx.interviewPrepDocument.upsert({
      where: { resumeVersionId: input.resumeVersionId },
      create: {
        userId: user.id,
        resumeVersionId: input.resumeVersionId,
        jdText: input.jdText,
        extraText: input.extraText,
        sections: json(input.sections),
        reflection: json([]),
        provider: identity.provider,
        model: identity.model,
      },
      update: {
        jdText: input.jdText,
        extraText: input.extraText,
        sections: json(input.sections),
      },
    })
    await tx.documentMutationEvent.create({ data: {
      userId: user.id,
      type: DocumentMutationType.INTERVIEW_PREP_SAVED,
      entityType: 'InterviewPrepDocument',
      entityId: saved.id,
      source: 'AI_USER_CONFIRMED',
      payload: json({ resumeVersionId: input.resumeVersionId, sectionCount: input.sections.length }),
    } })
    return saved
  })
}

export async function previewInterviewReflection(input: { resumeVersionId: string, recordText: string }) {
  const { version } = await requireVersion(input.resumeVersionId)
  if (!version) return null
  return interviewPrepProvider.extractReflection({ recordText: input.recordText })
}

export async function confirmInterviewReflection(input: InterviewReflectionConfirmInput) {
  const { user, version } = await requireVersion(input.resumeVersionId)
  if (!version) return null
  const entry: InterviewReflectionEntry = {
    id: crypto.randomUUID(),
    date: today(),
    recordText: input.recordText,
    extracted: input.extracted,
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.interviewPrepDocument.findUnique({
      where: { resumeVersionId: input.resumeVersionId },
      select: { reflection: true },
    })
    const mergedReflection = [...asReflection(existing?.reflection), entry]
    const saved = await tx.interviewPrepDocument.upsert({
      where: { resumeVersionId: input.resumeVersionId },
      create: {
        userId: user.id,
        resumeVersionId: input.resumeVersionId,
        jdText: '',
        extraText: '',
        sections: json([]),
        reflection: json(mergedReflection),
        provider: 'MANUAL',
        model: 'manual-reflection',
      },
      update: {
        reflection: json(mergedReflection),
      },
    })
    await tx.documentMutationEvent.create({ data: {
      userId: user.id,
      type: DocumentMutationType.INTERVIEW_REFLECTION_MERGED,
      entityType: 'InterviewPrepDocument',
      entityId: saved.id,
      source: 'AI_USER_CONFIRMED',
      payload: json({ resumeVersionId: input.resumeVersionId, entryId: entry.id }),
    } })
    return { doc: saved, entry }
  })
}

export async function exportInterviewPrepMarkdown(id: string) {
  const user = await getLocalUser()
  const doc = await prisma.interviewPrepDocument.findFirst({
    where: { id, userId: user.id },
    include: { resumeVersion: { include: { resume: true, application: { include: { job: { include: { company: true } } } } } } },
  })
  if (!doc) return null
  return buildInterviewPrepMarkdown({
    resumeLabel: versionLabel(doc.resumeVersion),
    sections: asSections(doc.sections),
    reflection: asReflection(doc.reflection),
    provider: doc.provider,
    model: doc.model,
    updatedAt: doc.updatedAt,
  })
}
