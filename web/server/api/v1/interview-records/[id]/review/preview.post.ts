import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { interviewRecordIdSchema, interviewReviewPreviewSchema } from '../../../../../schemas/interview-record'
import { previewInterviewRecordReview } from '../../../../../services/interview-record.service'
import { AiWorkflowError } from '../../../../../services/openai-compatible-json.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = interviewRecordIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = interviewReviewPreviewSchema.safeParse(await readBody(event))
  if (!id.success) return validationError(event, id.error.issues)
  if (!body.success) return validationError(event, body.error.issues)
  try {
    const preview = await previewInterviewRecordReview(id.data.id, body.data.transcript)
    if (!preview) return apiError(event, 404, 'INTERVIEW_RECORD_NOT_FOUND', 'Interview record not found.')
    return apiSuccess(event, preview)
  }
  catch (error) {
    if (error instanceof AiWorkflowError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'INTERVIEW_RECORD_REVIEW_EXTRACTION_FAILED', '复盘信息提取失败。')
  }
})