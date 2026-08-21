import { ApplicationEventType, DocumentMutationType, type ApplicationStatus, type Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import {
  interviewPrepBlocksSchema,
  interviewReviewEntriesSchema,
  type InterviewPrepBlock,
  type InterviewRecordCreateInput,
  type InterviewRecordGenerateInput,
  type InterviewRecordUpdateInput,
  type InterviewReviewConfirmInput,
  type InterviewReviewEntry,
} from '../schemas/interview-record'
import { interviewRecordProvider } from './interview-record-provider'
import { buildInterviewRecordMarkdown } from './interview-record-markdown'
import { getLocalUser } from './local-user'

const recordInclude = {
  application: { include: { job: { include: { company: true } } } },
  resumeVersion: {
    select: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
      application: { select: { job: { select: { title: true, company: { select: { name: true } } } } } },
    },
  },
} satisfies Prisma.InterviewRecordInclude

const INTERVIEW_RESULT_TO_STATUS: Record<string, ApplicationStatus> = {
  UNDECIDED: 'INTERVIEWING',
  PASSED: 'OFFERED',
  FAILED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
}

/** 面试结果 → 投递状态映射：通过且为终面/HR面 → OFFERED，其余通过 → INTERVIEWING。 */
export function interviewResultToApplicationStatus(result: string, round?: string | null): ApplicationStatus {
  if (result === 'PASSED') {
    return round === 'FINAL' || round === 'HR' ? 'OFFERED' : 'INTERVIEWING'
  }
  return INTERVIEW_RESULT_TO_STATUS[result] ?? 'INTERVIEWING'
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function asBlocks(value: Prisma.JsonValue | null | undefined): InterviewPrepBlock[] {
  const parsed = interviewPrepBlocksSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

function asReview(value: Prisma.JsonValue | null | undefined): InterviewReviewEntry[] {
  const parsed = interviewReviewEntriesSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

async function requireOwnedRecord(id: string) {
  const user = await getLocalUser()
  return prisma.interviewRecord.findFirst({
    where: { id, userId: user.id },
    include: recordInclude,
  })
}

async function validateBindings(applicationId?: string | null, resumeVersionId?: string | null) {
  const user = await getLocalUser()
  if (applicationId) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, userId: user.id, deletedAt: null },
      select: { id: true },
    })
    if (!app) return false
  }
  if (resumeVersionId) {
    const version = await prisma.resumeVersion.findFirst({
      where: { id: resumeVersionId, resume: { userId: user.id } },
      select: { id: true },
    })
    if (!version) return false
  }
  return true
}

async function syncApplicationStatusFromResult(tx: Prisma.TransactionClient, userId: string, applicationId: string, result: string, round?: string | null) {
  const current = await tx.application.findFirst({
    where: { id: applicationId, userId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!current) return false
  const targetStatus = interviewResultToApplicationStatus(result, round)
  if (current.status === targetStatus) return false
  await tx.application.update({ where: { id: current.id }, data: { status: targetStatus } })
  await tx.applicationEvent.create({
    data: {
      applicationId: current.id,
      type: ApplicationEventType.STATUS_CHANGED,
      payload: { fromStatus: current.status, toStatus: targetStatus, source: 'INTERVIEW_RECORD' },
    },
  })
  return true
}

export async function getInterviewRecord(id: string) {
  return requireOwnedRecord(id)
}

export async function listInterviewRecords(applicationId?: string) {
  const user = await getLocalUser()
  return prisma.interviewRecord.findMany({
    where: { userId: user.id, ...(applicationId ? { applicationId } : {}) },
    orderBy: { updatedAt: 'desc' },
    include: recordInclude,
  })
}

export async function createInterviewRecord(input: InterviewRecordCreateInput) {
  const user = await getLocalUser()
  if (!(await validateBindings(input.applicationId, input.resumeVersionId))) return null
  return prisma.$transaction(async (tx) => {
    const record = await tx.interviewRecord.create({
      data: {
        userId: user.id,
        applicationId: input.applicationId ?? null,
        resumeVersionId: input.resumeVersionId ?? null,
        companyName: input.companyName ?? null,
        jobTitle: input.jobTitle ?? null,
        jdText: input.jdText ?? null,
        round: input.round ?? null,
        interviewAt: input.interviewAt ?? null,
        methodAndAddress: input.methodAndAddress ?? null,
        briefNote: input.briefNote ?? null,
        prepSections: json(input.prepSections ?? []),
        prepNotes: input.prepNotes ?? null,
        result: input.result ?? null,
        review: json(input.review ?? []),
        provider: 'MANUAL',
        model: 'manual',
      },
      include: recordInclude,
    })
    await tx.documentMutationEvent.create({
      data: {
        userId: user.id,
        type: DocumentMutationType.INTERVIEW_RECORD_SAVED,
        entityType: 'InterviewRecord',
        entityId: record.id,
        source: 'USER',
        payload: json({ applicationId: record.applicationId ?? null }),
      },
    })
    if (record.applicationId && record.result) {
      await syncApplicationStatusFromResult(tx, user.id, record.applicationId, record.result, record.round)
    }
    return record
  })
}

export async function updateInterviewRecord(id: string, input: InterviewRecordUpdateInput) {
  const user = await getLocalUser()
  const existing = await prisma.interviewRecord.findFirst({
    where: { id, userId: user.id },
    select: { id: true, applicationId: true, result: true, round: true },
  })
  if (!existing) return null
  if (!(await validateBindings(input.applicationId, input.resumeVersionId))) return null
  return prisma.$transaction(async (tx) => {
    const updated = await tx.interviewRecord.update({
      where: { id },
      data: {
        ...(input.applicationId !== undefined ? { applicationId: input.applicationId } : {}),
        ...(input.resumeVersionId !== undefined ? { resumeVersionId: input.resumeVersionId } : {}),
        ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
        ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
        ...(input.jdText !== undefined ? { jdText: input.jdText } : {}),
        ...(input.round !== undefined ? { round: input.round } : {}),
        ...(input.interviewAt !== undefined ? { interviewAt: input.interviewAt } : {}),
        ...(input.methodAndAddress !== undefined ? { methodAndAddress: input.methodAndAddress } : {}),
        ...(input.briefNote !== undefined ? { briefNote: input.briefNote } : {}),
        ...(input.prepSections !== undefined ? { prepSections: json(input.prepSections) } : {}),
        ...(input.prepNotes !== undefined ? { prepNotes: input.prepNotes } : {}),
        ...(input.result !== undefined ? { result: input.result } : {}),
        ...(input.review !== undefined ? { review: json(input.review) } : {}),
      },
      include: recordInclude,
    })
    await tx.documentMutationEvent.create({
      data: {
        userId: user.id,
        type: DocumentMutationType.INTERVIEW_RECORD_SAVED,
        entityType: 'InterviewRecord',
        entityId: updated.id,
        source: 'USER',
        payload: json({ fields: Object.keys(input).filter(key => input[key as keyof InterviewRecordUpdateInput] !== undefined) }),
      },
    })
    const applicationId = input.applicationId !== undefined ? input.applicationId : existing.applicationId
    const resultChanged = input.result !== undefined && input.result !== existing.result
    if (applicationId && resultChanged) {
      const round = input.round !== undefined ? input.round : existing.round
      await syncApplicationStatusFromResult(tx, user.id, applicationId, input.result as string, round)
    }
    return updated
  })
}

export async function generateInterviewRecordPreview(input: InterviewRecordGenerateInput) {
  const user = await getLocalUser()
  let jdText = input.jdText ?? null
  let companyName: string | null | undefined
  let jobTitle: string | null | undefined
  if (input.applicationId) {
    const app = await prisma.application.findFirst({
      where: { id: input.applicationId, userId: user.id, deletedAt: null },
      include: { job: { include: { company: true } } },
    })
    if (!app) return null
    companyName = app.job.company.name
    jobTitle = app.job.title
    jdText = jdText ?? app.job.description
  }
  let resumeContent = ''
  if (input.resumeVersionId) {
    const version = await prisma.resumeVersion.findFirst({
      where: { id: input.resumeVersionId, resume: { userId: user.id } },
      select: { content: true },
    })
    if (!version) return null
    resumeContent = version.content
  }
  const where: Prisma.MaterialCardWhereInput = { userId: user.id, archivedAt: null }
  if (input.materialCardIds?.length) where.id = { in: input.materialCardIds }
  const cards = await prisma.materialCard.findMany({
    where,
    include: { variants: { orderBy: { createdAt: 'desc' } } },
    take: 100,
  })
  const materialCardsDigest = cards.map((card) => {
    const variant = card.variants[0]
    return `- ${card.title}（${card.type}）${variant ? `：${variant.content.slice(0, 800)}` : ''}`
  }).join('\n')
  return interviewRecordProvider.generate({
    companyName,
    jobTitle,
    jdText,
    resumeContent,
    materialCardsDigest,
  })
}

export async function previewInterviewRecordReview(id: string, transcript: string) {
  const record = await requireOwnedRecord(id)
  if (!record) return null
  return interviewRecordProvider.extractReview({ transcript })
}

export async function confirmInterviewRecordReview(id: string, input: InterviewReviewConfirmInput) {
  const user = await getLocalUser()
  const existing = await prisma.interviewRecord.findFirst({
    where: { id, userId: user.id },
    select: { review: true },
  })
  if (!existing) return null
  const entry: InterviewReviewEntry = {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    transcript: input.transcript,
    extracted: input.extracted,
  }
  return prisma.$transaction(async (tx) => {
    const merged = [...asReview(existing.review), entry]
    const updated = await tx.interviewRecord.update({
      where: { id },
      data: { review: json(merged) },
      include: recordInclude,
    })
    await tx.documentMutationEvent.create({
      data: {
        userId: user.id,
        type: DocumentMutationType.INTERVIEW_RECORD_REVIEW_SAVED,
        entityType: 'InterviewRecord',
        entityId: updated.id,
        source: 'AI_USER_CONFIRMED',
        payload: json({ entryId: entry.id }),
      },
    })
    return { record: updated, entry }
  })
}

export async function exportInterviewRecordMarkdown(id: string) {
  const record = await requireOwnedRecord(id)
  if (!record) return null
  return buildInterviewRecordMarkdown({
    companyName: record.companyName ?? record.application?.job.company.name ?? null,
    jobTitle: record.jobTitle ?? record.application?.job.title ?? null,
    jdText: record.jdText ?? record.application?.job.description ?? null,
    round: record.round ?? null,
    interviewAt: record.interviewAt,
    methodAndAddress: record.methodAndAddress,
    briefNote: record.briefNote,
    prepBlocks: asBlocks(record.prepSections),
    prepNotes: record.prepNotes,
    review: asReview(record.review),
    provider: record.provider,
    model: record.model,
    updatedAt: record.updatedAt,
  })
}
