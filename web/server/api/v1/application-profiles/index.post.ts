import { defineEventHandler, readBody } from 'h3'

import { applicationProfileSchema } from '../../../schemas/application-profile'
import { createApplicationProfile } from '../../../services/application-profile.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = applicationProfileSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)

  const result = await createApplicationProfile(body.data)
  if (result.duplicateName) return apiError(event, 409, 'APPLICATION_PROFILE_NAME_EXISTS', 'An application profile with this name already exists.')
  if (result.invalidResumeVersion) return apiError(event, 400, 'RESUME_VERSION_NOT_FOUND', 'The selected resume version was not found.')
  return apiSuccess(event, result.profile, 201)
})
