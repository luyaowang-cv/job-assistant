import { defineEventHandler, getRouterParam } from 'h3'

import { jobIdSchema } from '../../../../schemas/job-library'
import { manuallyOfflineJob } from '../../../../services/job-library.service'
import { isCurrentUserAdmin } from '../../../../services/current-user'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  if (!(await isCurrentUserAdmin())) return apiError(event, 403, 'FORBIDDEN', '需要管理员权限。')
  const parsed = jobIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!parsed.success) return validationError(event, parsed.error.issues)
  const job = await manuallyOfflineJob(parsed.data.id)
  if (!job) return apiError(event, 404, 'JOB_NOT_FOUND', 'Job was not found.')
  return apiSuccess(event, job)
})
