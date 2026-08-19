import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { applicationIdSchema, updateApplicationSchema } from '../../../schemas/application'
import { updateApplication } from '../../../services/application.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = applicationIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = updateApplicationSchema.safeParse(await readBody(event))

  if (!id.success) {
    return validationError(event, id.error.issues)
  }

  if (!body.success) {
    return validationError(event, body.error.issues)
  }

  const application = await updateApplication(id.data.id, body.data)

  if (!application) {
    return apiError(event, 404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  }

  return apiSuccess(event, application)
})
