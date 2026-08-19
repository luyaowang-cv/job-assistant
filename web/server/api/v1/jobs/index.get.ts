import { defineEventHandler, getQuery } from 'h3'

import { listJobsQuerySchema } from '../../../schemas/job-library'
import { listJobs } from '../../../services/job-library.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = listJobsQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) return validationError(event, parsed.error.issues)
  return apiSuccess(event, await listJobs(parsed.data))
})
