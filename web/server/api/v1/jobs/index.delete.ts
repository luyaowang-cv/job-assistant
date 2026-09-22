import { defineEventHandler } from 'h3'

import { clearJobs } from '../../../services/job-library.service'
import { isCurrentUserAdmin } from '../../../services/current-user'
import { apiError, apiSuccess } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  if (!(await isCurrentUserAdmin())) return apiError(event, 403, 'FORBIDDEN', '需要管理员权限。')
  return apiSuccess(event, await clearJobs())
})
