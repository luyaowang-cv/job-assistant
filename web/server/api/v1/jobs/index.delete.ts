import { defineEventHandler } from 'h3'

import { clearJobs } from '../../../services/job-library.service'
import { apiSuccess } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  return apiSuccess(event, await clearJobs())
})
