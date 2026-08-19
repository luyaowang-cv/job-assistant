import { defineEventHandler, readBody } from 'h3'
import { personalProfileSchema } from '../../../schemas/personal-profile'
import { savePersonalProfile } from '../../../services/personal-profile.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = personalProfileSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  return apiSuccess(event, await savePersonalProfile(body.data))
})
