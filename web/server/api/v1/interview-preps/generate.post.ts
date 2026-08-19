import { defineEventHandler, readBody } from 'h3'

import { interviewPrepGenerateSchema } from '../../../schemas/interview-prep'
import { generateInterviewPrepPreview } from '../../../services/interview-prep.service'
import { AiWorkflowError } from '../../../services/openai-compatible-json.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = interviewPrepGenerateSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  try {
    const generated = await generateInterviewPrepPreview(body.data)
    if (!generated) return apiError(event, 404, 'RESUME_VERSION_NOT_FOUND', 'Resume version not found.')
    return apiSuccess(event, generated)
  }
  catch (error) {
    if (error instanceof AiWorkflowError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'INTERVIEW_PREP_GENERATION_FAILED', '面试资料生成失败。')
  }
})