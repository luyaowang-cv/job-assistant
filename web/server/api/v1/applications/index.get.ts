import { defineEventHandler, getQuery } from 'h3'

import { listApplicationsQuerySchema } from '../../../schemas/application'
import { listApplications } from '../../../services/application.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = listApplicationsQuerySchema.safeParse(getQuery(event))

  if (!parsed.success) {
    return validationError(event, parsed.error.issues)
  }

  return apiSuccess(event, await listApplications(parsed.data))
})
