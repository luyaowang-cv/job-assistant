import { createHash } from 'node:crypto'

import { AgentRunStatus, AgentRunType } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { ResumeDigest, SaveApplicationMaterialsInput } from '../schemas/application-materials'

import { getLocalUser } from './local-user'

export function digestMaterialResume(resumeText: string): ResumeDigest {
  const normalized = resumeText.trim().replace(/\s+/g, ' ')
  const keywordSummary = [...new Set(normalized
    .split(/[^\p{L}\p{N}+#.]+/u)
    .filter(word => word.length >= 2))]
    .slice(0, 20)

  return {
    sha256: createHash('sha256').update(normalized).digest('hex'),
    characterCount: normalized.length,
    keywordSummary,
  }
}

export async function getMaterialApplicationContext(applicationId: string) {
  const user = await getLocalUser()

  return prisma.application.findFirst({
    where: { id: applicationId, userId: user.id, deletedAt: null },
    include: {
      job: { include: { company: true } },
      agentRuns: {
        where: { type: AgentRunType.JOB_EVALUATION, status: AgentRunStatus.SUCCEEDED },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  })
}

export async function saveApplicationMaterials(applicationId: string, input: SaveApplicationMaterialsInput, provider: string, model: string) {
  const [user, application] = await Promise.all([getLocalUser(), getMaterialApplicationContext(applicationId)])
  if (!application) return null

  const evaluationRunId = input.evaluationRunId ?? application.agentRuns[0]?.id ?? null
  if (evaluationRunId && !application.agentRuns.some(run => run.id === evaluationRunId)) {
    return null
  }

  const wasEdited = JSON.stringify(input.aiDraft) !== JSON.stringify(input.content)
  return prisma.applicationMaterial.create({
    data: {
      userId: user.id,
      applicationId: application.id,
      evaluationRunId,
      resumeDigest: input.resumeDigest,
      aiDraft: input.aiDraft,
      content: input.content,
      wasEdited,
      provider,
      model,
    },
  })
}

export async function listApplicationMaterials(applicationId: string) {
  const user = await getLocalUser()
  return prisma.applicationMaterial.findMany({
    where: { applicationId, userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
}
