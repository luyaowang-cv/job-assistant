import { ApplicationEventType, type Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type {
  CreateApplicationInput,
  ListApplicationsQuery,
  UpdateApplicationInput,
  UpdateApplicationStatusInput,
} from '../schemas/application'

import { getLocalUser } from './local-user'

export async function createApplication(input: CreateApplicationInput) {
  const user = await getLocalUser()

  return prisma.$transaction(async (transaction) => {
    const company = await transaction.company.upsert({
      where: { name: input.companyName },
      update: {
        website: input.companyWebsite ?? undefined,
        industry: input.companyIndustry ?? undefined,
        companyType: input.companyType ?? undefined,
        tags: input.companyTags ?? undefined,
      },
      create: {
        name: input.companyName,
        website: input.companyWebsite ?? null,
        industry: input.companyIndustry ?? null,
        companyType: input.companyType ?? null,
        tags: input.companyTags ?? [],
      },
    })

    const job = await transaction.job.create({
      data: {
        companyId: company.id,
        title: input.jobTitle,
        department: input.department ?? null,
        location: input.location ?? null,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        source: input.source,
        url: input.jobUrl ?? null,
        description: input.description ?? null,
        deadlineAt: input.deadlineAt ?? null,
      },
    })

    const application = await transaction.application.create({
      data: {
        userId: user.id,
        jobId: job.id,
        status: input.status,
        channel: input.channel,
        appliedAt: input.appliedAt ?? null,
        nextAction: input.nextAction ?? null,
        nextActionAt: input.nextActionAt ?? null,
        notes: input.notes ?? null,
      },
      include: {
        job: {
          include: { company: true },
        },
      },
    })

    await transaction.applicationEvent.create({
      data: {
        applicationId: application.id,
        type: ApplicationEventType.CREATE,
        payload: {
          source: 'MANUAL',
          status: input.status,
          channel: input.channel,
        },
      },
    })

    return application
  })
}

export async function listApplications(query: ListApplicationsQuery) {
  const user = await getLocalUser()
  const where: Prisma.ApplicationWhereInput = {
    userId: user.id,
    deletedAt: null,
  }

  if (query.status) {
    where.status = query.status
  }

  if (query.channel) {
    where.channel = query.channel
  }

  if (query.search) {
    where.OR = [
      { job: { title: { contains: query.search, mode: 'insensitive' } } },
      { job: { company: { name: { contains: query.search, mode: 'insensitive' } } } },
    ]
  }

  const [items, total] = await prisma.$transaction([
    prisma.application.findMany({
      where,
      include: { job: { include: { company: true } } },
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.application.count({ where }),
  ])

  return { items, page: query.page, pageSize: query.pageSize, total }
}

export async function getApplication(applicationId: string) {
  const user = await getLocalUser()

  return prisma.application.findFirst({
    where: { id: applicationId, userId: user.id, deletedAt: null },
    include: {
      job: { include: { company: true } },
      events: { orderBy: { occurredAt: 'desc' } },
    },
  })
}

export async function updateApplication(applicationId: string, input: UpdateApplicationInput) {
  const current = await getApplication(applicationId)

  if (!current) {
    return null
  }

  return prisma.$transaction(async (transaction) => {
    const changedFields = Object.keys(input).filter(key => input[key as keyof UpdateApplicationInput] !== undefined)

    if (input.companyName !== undefined || input.companyWebsite !== undefined || input.companyIndustry !== undefined || input.companyType !== undefined || input.companyTags !== undefined) {
      await transaction.company.update({
        where: { id: current.job.company.id },
        data: {
          name: input.companyName,
          website: input.companyWebsite,
          industry: input.companyIndustry,
          companyType: input.companyType,
          tags: input.companyTags,
        },
      })
    }

    if (input.jobTitle !== undefined || input.department !== undefined || input.location !== undefined || input.salaryMin !== undefined || input.salaryMax !== undefined || input.source !== undefined || input.jobUrl !== undefined || input.description !== undefined || input.deadlineAt !== undefined) {
      await transaction.job.update({
        where: { id: current.jobId },
        data: {
          title: input.jobTitle,
          department: input.department,
          location: input.location,
          salaryMin: input.salaryMin,
          salaryMax: input.salaryMax,
          source: input.source,
          url: input.jobUrl,
          description: input.description,
          deadlineAt: input.deadlineAt,
        },
      })
    }

    const application = await transaction.application.update({
      where: { id: current.id },
      data: {
        channel: input.channel,
        appliedAt: input.appliedAt,
        nextAction: input.nextAction,
        nextActionAt: input.nextActionAt,
        notes: input.notes,
      },
      include: { job: { include: { company: true } } },
    })

    await transaction.applicationEvent.create({
      data: {
        applicationId: current.id,
        type: ApplicationEventType.UPDATE,
        payload: { changedFields },
      },
    })

    return application
  })
}

export async function updateApplicationStatus(applicationId: string, input: UpdateApplicationStatusInput) {
  const current = await getApplication(applicationId)

  if (!current) {
    return null
  }

  if (current.status === input.status) {
    return current
  }

  return prisma.$transaction(async (transaction) => {
    const application = await transaction.application.update({
      where: { id: current.id },
      data: { status: input.status },
      include: { job: { include: { company: true } } },
    })

    await transaction.applicationEvent.create({
      data: {
        applicationId: current.id,
        type: ApplicationEventType.STATUS_CHANGED,
        payload: {
          fromStatus: current.status,
          toStatus: input.status,
          source: input.source,
        },
      },
    })

    return application
  })
}

export async function deleteApplication(applicationId: string) {
  const current = await getApplication(applicationId)

  if (!current) {
    return null
  }

  return prisma.$transaction(async (transaction) => {
    const deletedAt = new Date()
    await transaction.application.update({
      where: { id: current.id },
      data: { deletedAt },
    })
    await transaction.applicationEvent.create({
      data: {
        applicationId: current.id,
        type: ApplicationEventType.DELETE,
        payload: { deletedAt: deletedAt.toISOString() },
      },
    })

    return { id: current.id, deletedAt }
  })
}
