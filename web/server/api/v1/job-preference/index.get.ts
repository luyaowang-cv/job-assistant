import { defineEventHandler } from 'h3'

import { getJobPreference } from '../../../services/job-evaluation.service'
import { apiSuccess } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  return apiSuccess(event, await getJobPreference())
})
