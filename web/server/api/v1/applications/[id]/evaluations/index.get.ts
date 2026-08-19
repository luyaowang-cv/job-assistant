import { defineEventHandler, getRouterParam } from 'h3'

import { applicationIdSchema } from '../../../../../schemas/application'
import { getEvaluableApplication, listEvaluationRuns } from '../../../../../services/job-evaluation.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = applicationIdSchema.safeParse({ id: getRouterParam(event, 'id') })

  if (!id.success) {
    return validationError(event, id.error.issues)
  }

  if (!await getEvaluableApplication(id.data.id)) {
    return apiError(event, 404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  }

  return apiSuccess(event, await listEvaluationRuns(id.data.id))
})
