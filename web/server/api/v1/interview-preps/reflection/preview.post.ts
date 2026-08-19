import { defineEventHandler, readBody } from 'h3'

import { interviewReflectionPreviewSchema } from '../../../../schemas/interview-prep'
import { previewInterviewReflection } from '../../../../services/interview-prep.service'
import { AiWorkflowError } from '../../../../services/openai-compatible-json.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = interviewReflectionPreviewSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  try {
    const preview = await previewInterviewReflection(body.data)
    if (!preview) return apiError(event, 404, 'RESUME_VERSION_NOT_FOUND', 'Resume version not found.')
    return apiSuccess(event, preview)
  }
  catch (error) {
    if (error instanceof AiWorkflowError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'INTERVIEW_REFLECTION_EXTRACTION_FAILED', '复盘信息提取失败。')
  }
})