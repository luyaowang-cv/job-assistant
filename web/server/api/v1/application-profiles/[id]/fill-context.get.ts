import { defineEventHandler, getRouterParam } from 'h3'

import { applicationProfileIdSchema } from '../../../../schemas/application-profile'
import { getApplicationProfileFillContext } from '../../../../services/application-profile.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = applicationProfileIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!id.success) return validationError(event, id.error.issues)
  const context = await getApplicationProfileFillContext(id.data.id)
  if (!context) return apiError(event, 404, 'APPLICATION_PROFILE_NOT_FOUND', 'Application profile was not found.')
  return apiSuccess(event, context)
})
