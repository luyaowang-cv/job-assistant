import { defineEventHandler, getQuery } from 'h3'

import { interviewPrepQuerySchema } from '../../../schemas/interview-prep'
import { getInterviewPrep } from '../../../services/interview-prep.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const query = interviewPrepQuerySchema.safeParse(getQuery(event))
  if (!query.success) return validationError(event, query.error.issues)
  return apiSuccess(event, await getInterviewPrep(query.data.resumeVersionId))
})