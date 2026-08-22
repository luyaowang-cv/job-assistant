import { defineEventHandler, getRouterParam } from 'h3'

import { jobIdSchema } from '../../../../schemas/job-library'
import { manuallyOfflineJob } from '../../../../services/job-library.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = jobIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!parsed.success) return validationError(event, parsed.error.issues)
  const job = await manuallyOfflineJob(parsed.data.id)
  if (!job) return apiError(event, 404, 'JOB_NOT_FOUND', 'Job was not found.')
  return apiSuccess(event, job)
})
