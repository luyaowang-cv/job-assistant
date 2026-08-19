import { defineEventHandler, readBody } from 'h3'

import { baseResumeSchema } from '../../../schemas/resume'
import { replaceBaseResume } from '../../../services/resume.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = baseResumeSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const version = await replaceBaseResume(body.data)
  if (!version) return apiError(event, 404, 'BASE_RESUME_NOT_FOUND', 'Create a base resume before replacing it.')
  return apiSuccess(event, version)
})
