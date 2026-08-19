import { defineEventHandler, readBody } from 'h3'

import { resumeOptimizationPreviewSchema } from '../../../schemas/resume'
import { resumeOptimizationProvider } from '../../../services/resume-optimization-provider'
import { AiWorkflowError } from '../../../services/openai-compatible-json.service'
import { getResumeOptimizationContext } from '../../../services/resume.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = resumeOptimizationPreviewSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const context = await getResumeOptimizationContext(body.data.applicationId)
  if (!context.resume?.baseVersion) return apiError(event, 409, 'BASE_RESUME_REQUIRED', 'Save a base resume before creating a tailored preview.')
  if (!context.application) return apiError(event, 404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  if (!context.application.job.description?.trim()) return apiError(event, 422, 'JOB_DESCRIPTION_REQUIRED', 'A saved job description is required.')

  try {
    const generated = await resumeOptimizationProvider.preview({
      baseContent: context.resume.baseVersion.content,
      companyName: context.application.job.company.name,
      jobTitle: context.application.job.title,
      jobDescription: context.application.job.description,
    })
    return apiSuccess(event, { ...generated.data, applicationId: context.application.id, provider: generated.provider, model: generated.model })
  }
  catch (error) {
    if (error instanceof AiWorkflowError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'RESUME_OPTIMIZATION_FAILED', '简历优化失败。')
  }
})
