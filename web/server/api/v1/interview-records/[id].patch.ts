import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { interviewRecordIdSchema, interviewRecordUpdateSchema } from '../../../schemas/interview-record'
import { updateInterviewRecord } from '../../../services/interview-record.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = interviewRecordIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = interviewRecordUpdateSchema.safeParse(await readBody(event))
  if (!id.success) return validationError(event, id.error.issues)
  if (!body.success) return validationError(event, body.error.issues)
  const record = await updateInterviewRecord(id.data.id, body.data)
  if (!record) return apiError(event, 404, 'INTERVIEW_RECORD_NOT_FOUND', 'Interview record not found.')
  return apiSuccess(event, record)
})