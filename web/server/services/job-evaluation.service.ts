import { createHash } from 'node:crypto'

import { AgentRunStatus, AgentRunType } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { JobEvaluationResult, JobPreferenceInput, ResumeDigest } from '../schemas/job-evaluation'

import { getLocalUser } from './local-user'

const defaultPreference: JobPreferenceInput = {
  targetRoles: ['前端工程师', 'AI 前端工程师'],
  targetCities: ['北京'],
  companyTypes: [],
  technicalFocus: ['Vue', 'TypeScript', 'Agent'],
}

export function digestResume(resumeText: string): ResumeDigest {
  const normalized = resumeText.trim().replace(/\s+/g, ' ')
  const keywords = normalized
    .split(/[^\p{L}\p{N}+#.]+/u)
    .filter(word => word.length >= 2)
    .filter((word, index, words) => words.indexOf(word) === index)
    .slice(0, 20)

  return {
    sha256: createHash('sha256').update(normalized).digest('hex'),
    characterCount: normalized.length,
    keywordSummary: keywords,
  }
}

export async function getJobPreference() {
  const user = await getLocalUser()

  return prisma.jobPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, ...defaultPreference },
  })
}

export async function updateJobPreference(input: JobPreferenceInput) {
  const user = await getLocalUser()

  return prisma.jobPreference.upsert({
    where: { userId: user.id },
    update: input,
    create: { userId: user.id, ...input },
  })
}

export async function getEvaluableApplication(applicationId: string) {
  const user = await getLocalUser()

  return prisma.application.findFirst({
    where: { id: applicationId, userId: user.id, deletedAt: null },
    include: { job: { include: { company: true } } },
  })
}

export async function createPendingEvaluationRun(
  applicationId: string,
  resumeText: string,
  provider: string,
  model: string,
) {
  const [user, preference, application] = await Promise.all([
    getLocalUser(),
    getJobPreference(),
    getEvaluableApplication(applicationId),
  ])

  if (!application) {
    return null
  }

  const resumeDigest = digestResume(resumeText)

  return prisma.agentRun.create({
    data: {
      userId: user.id,
      applicationId: application.id,
      type: AgentRunType.JOB_EVALUATION,
      status: AgentRunStatus.PENDING,
      preferenceSnapshot: preference,
      resumeDigest,
      provider,
      model,
    },
  })
}

export async function completeEvaluationRun(runId: string, output: JobEvaluationResult) {
  const user = await getLocalUser()

  return prisma.agentRun.updateMany({
    where: { id: runId, userId: user.id, status: AgentRunStatus.PENDING },
    data: {
      status: AgentRunStatus.SUCCEEDED,
      output,
      completedAt: new Date(),
    },
  })
}

export async function failEvaluationRun(runId: string, errorMessage: string) {
  const user = await getLocalUser()

  return prisma.agentRun.updateMany({
    where: { id: runId, userId: user.id, status: AgentRunStatus.PENDING },
    data: {
      status: AgentRunStatus.FAILED,
      errorMessage: errorMessage.slice(0, 500),
      completedAt: new Date(),
    },
  })
}

export async function listEvaluationRuns(applicationId: string) {
  const user = await getLocalUser()

  return prisma.agentRun.findMany({
    where: {
      applicationId,
      userId: user.id,
      type: AgentRunType.JOB_EVALUATION,
    },
    orderBy: { startedAt: 'desc' },
  })
}
