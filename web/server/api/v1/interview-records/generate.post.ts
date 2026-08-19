import { defineEventHandler, readBody } from 'h3'

import { interviewRecordGenerateSchema } from '../../../schemas/interview-record'
import { generateInterviewRecordPreview } from '../../../services/interview-record.service'
import { AiWorkflowError } from '../../../services/openai-compatible-json.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = interviewRecordGenerateSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  try {
    const generated = await generateInterviewRecordPreview(body.data)
    if (!generated) return apiError(event, 404, 'BINDING_NOT_FOUND', 'Application or resume version binding not found.')
    return apiSuccess(event, generated)
  }
  catch (error) {
    if (error instanceof AiWorkflowError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'INTERVIEW_RECORD_GENERATION_FAILED', '面试材料生成失败。')
  }
})