import { defineEventHandler, getQuery } from 'h3'

import { interviewRecordQuerySchema } from '../../../schemas/interview-record'
import { getInterviewRecord, listInterviewRecords } from '../../../services/interview-record.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const query = interviewRecordQuerySchema.safeParse(getQuery(event))
  if (!query.success) return validationError(event, query.error.issues)
  const { id, applicationId } = query.data
  if (id) return apiSuccess(event, await getInterviewRecord(id))
  return apiSuccess(event, await listInterviewRecords(applicationId))
})
