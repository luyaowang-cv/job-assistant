import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { applicationProfileIdSchema, applicationProfileSchema } from '../../../schemas/application-profile'
import { updateApplicationProfile } from '../../../services/application-profile.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = applicationProfileIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = applicationProfileSchema.safeParse(await readBody(event))
  if (!id.success) return validationError(event, id.error.issues)
  if (!body.success) return validationError(event, body.error.issues)

  const result = await updateApplicationProfile(id.data.id, body.data)
  if (result.duplicateName) return apiError(event, 409, 'APPLICATION_PROFILE_NAME_EXISTS', 'An application profile with this name already exists.')
  if (result.invalidResumeVersion) return apiError(event, 400, 'RESUME_VERSION_NOT_FOUND', 'The selected resume version was not found.')
  if (!result.profile) return apiError(event, 404, 'APPLICATION_PROFILE_NOT_FOUND', 'Application profile was not found.')
  return apiSuccess(event, result.profile)
})
