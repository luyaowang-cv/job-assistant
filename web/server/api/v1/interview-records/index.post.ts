import { defineEventHandler, readBody } from 'h3'

import { interviewRecordCreateSchema } from '../../../schemas/interview-record'
import { createInterviewRecord } from '../../../services/interview-record.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = interviewRecordCreateSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const record = await createInterviewRecord(body.data)
  if (!record) return apiError(event, 404, 'BINDING_NOT_FOUND', 'Application or resume version binding not found.')
  return apiSuccess(event, record, 201)
})