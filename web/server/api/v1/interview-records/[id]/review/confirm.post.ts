import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { interviewRecordIdSchema, interviewReviewConfirmSchema } from '../../../../../schemas/interview-record'
import { confirmInterviewRecordReview } from '../../../../../services/interview-record.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = interviewRecordIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = interviewReviewConfirmSchema.safeParse(await readBody(event))
  if (!id.success) return validationError(event, id.error.issues)
  if (!body.success) return validationError(event, body.error.issues)
  const confirmed = await confirmInterviewRecordReview(id.data.id, body.data)
  if (!confirmed) return apiError(event, 404, 'INTERVIEW_RECORD_NOT_FOUND', 'Interview record not found.')
  return apiSuccess(event, confirmed)
})