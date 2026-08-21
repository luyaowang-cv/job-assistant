import { ApplicationEventType, DocumentMutationType, type Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import { interviewPrepBlocksSchema } from '../schemas/interview-record'
import type {
  CareerAgentConversationCreateInput,
  CareerAgentSaveToInterviewInput,
  CareerAgentStoredMessageInput,
} from '../schemas/career-agent-conversation'
import { getLocalUser } from './local-user'

const conversationContext = {
  application: { select: { id: true, job: { select: { title: true, company: { select: { name: true } } } } } },
  resumeVersion: { select: { id: true, name: true, type: true } },
} satisfies Prisma.CareerAgentConversationInclude

async function ownedConversation(id: string) {
  const user = await getLocalUser()
  return prisma.careerAgentConversation.findFirst({ where: { id, userId: user.id }, include: conversationContext })
}

async function validBindings(userId: string, input: CareerAgentConversationCreateInput) {
  const [application, resumeVersion] = await Promise.all([
    input.applicationId ? prisma.application.findFirst({ where: { id: input.applicationId, userId, deletedAt: null }, select: { id: true } }) : true,
    input.resumeVersionId ? prisma.resumeVersion.findFirst({ where: { id: input.resumeVersionId, resume: { userId } }, select: { id: true } }) : true,
  ])
  return Boolean(application && resumeVersion)
}

export async function listCareerAgentConversations() {
  const user = await getLocalUser()
  return prisma.careerAgentConversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { ...conversationContext, _count: { select: { messages: true } } },
  })
}

export async function createCareerAgentConversation(input: CareerAgentConversationCreateInput) {
  const user = await getLocalUser()
  if (!(await validBindings(user.id, input))) return null
  return prisma.careerAgentConversation.create({
    data: { userId: user.id, applicationId: input.applicationId ?? null, resumeVersionId: input.resumeVersionId ?? null },
    include: conversationContext,
  })
}

export async function getCareerAgentConversation(id: string) {
  const user = await getLocalUser()
  return prisma.careerAgentConversation.findFirst({
    where: { id, userId: user.id },
    include: { ...conversationContext, messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
  })
}

export async function addCareerAgentMessage(id: string, input: CareerAgentStoredMessageInput) {
  const conversation = await ownedConversation(id)
  if (!conversation) return null
  const compactTitle = input.content.replace(/\s+/g, ' ').slice(0, 36)
  return prisma.$transaction(async (tx) => {
    const message = await tx.careerAgentMessage.create({
      data: {
        conversationId: id,
        role: input.role,
        content: input.content,
        error: input.error ?? false,
        provider: input.provider ?? null,
        model: input.model ?? null,
      },
    })
    await tx.careerAgentConversation.update({
      where: { id },
      data: {
        ...(conversation.title === '新对话' && input.role === 'user' ? { title: compactTitle || '新对话' } : {}),
        updatedAt: new Date(),
      },
    })
    return message
  })
}

export async function deleteCareerAgentConversation(id: string) {
  const conversation = await ownedConversation(id)
  if (!conversation) return false
  await prisma.careerAgentConversation.delete({ where: { id } })
  return true
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export async function saveAgentMessageToInterview(messageId: string, input: CareerAgentSaveToInterviewInput) {
  const user = await getLocalUser()
  const message = await prisma.careerAgentMessage.findFirst({
    where: { id: messageId, role: 'assistant', conversation: { userId: user.id } },
    include: { conversation: { include: { application: { include: { job: { include: { company: true } } } } } } },
  })
  if (!message) return null

  const conversation = message.conversation
  const existing = conversation.applicationId
    ? await prisma.interviewRecord.findFirst({ where: { userId: user.id, applicationId: conversation.applicationId }, orderBy: { updatedAt: 'desc' } })
    : null
  const previous = interviewPrepBlocksSchema.safeParse(existing?.prepSections)
  const prepSections = previous.success ? previous.data : []
  const block = { id: `block-${crypto.randomUUID()}`, kind: input.kind, title: input.title, content: message.content }

  return prisma.$transaction(async (tx) => {
    const record = existing
      ? await tx.interviewRecord.update({
          where: { id: existing.id },
          data: { prepSections: json([...prepSections, block]), provider: message.provider ?? existing.provider, model: message.model ?? existing.model },
        })
      : await tx.interviewRecord.create({
          data: {
            userId: user.id,
            applicationId: conversation.applicationId,
            resumeVersionId: conversation.resumeVersionId,
            companyName: conversation.application?.job.company.name ?? null,
            jobTitle: conversation.application?.job.title ?? null,
            jdText: conversation.application?.job.description ?? null,
            prepSections: json([block]),
            provider: message.provider ?? 'CAREER_AGENT',
            model: message.model ?? 'unknown',
          },
        })
    await tx.documentMutationEvent.create({
      data: {
        userId: user.id,
        type: DocumentMutationType.INTERVIEW_RECORD_SAVED,
        entityType: 'InterviewRecord',
        entityId: record.id,
        source: 'CAREER_AGENT_USER_CONFIRMED',
        payload: json({ conversationId: conversation.id, messageId, blockId: block.id, kind: block.kind }),
      },
    })
    if (conversation.applicationId) {
      await tx.applicationEvent.create({
        data: {
          applicationId: conversation.applicationId,
          type: ApplicationEventType.UPDATE,
          payload: json({ source: 'CAREER_AGENT_SAVE_TO_INTERVIEW', interviewRecordId: record.id, messageId }),
        },
      })
    }
    return { recordId: record.id, block }
  })
}
