import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { applicationIdSchema } from '../../../../../schemas/application'
import { previewApplicationMaterialsSchema } from '../../../../../schemas/application-materials'
import { applicationMaterialsProvider } from '../../../../../services/application-materials-provider'
import { AiWorkflowError } from '../../../../../services/openai-compatible-json.service'
import { digestMaterialResume, getMaterialApplicationContext } from '../../../../../services/application-materials.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = applicationIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = previewApplicationMaterialsSchema.safeParse(await readBody(event))
  if (!id.success) return validationError(event, id.error.issues)
  if (!body.success) return validationError(event, body.error.issues)

  const application = await getMaterialApplicationContext(id.data.id)
  if (!application) return apiError(event, 404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  if (!application.job.description?.trim()) return apiError(event, 422, 'JOB_DESCRIPTION_REQUIRED', 'A saved job description is required for materials.')

  let generated
  try {
    generated = await applicationMaterialsProvider.preview({
      companyName: application.job.company.name,
      jobTitle: application.job.title,
      jobDescription: application.job.description,
      resumeText: body.data.resumeText,
      evaluationOutput: application.agentRuns[0]?.output,
    })
  }
  catch (error) {
    if (error instanceof AiWorkflowError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'MATERIALS_PREVIEW_FAILED', '投递材料生成失败。')
  }

  return apiSuccess(event, {
    aiDraft: generated.data,
    resumeDigest: digestMaterialResume(body.data.resumeText),
    evaluationRunId: application.agentRuns[0]?.id ?? null,
    provider: generated.provider,
    model: generated.model,
  })
})
