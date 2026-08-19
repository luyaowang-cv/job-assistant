import { defineEventHandler, readBody } from 'h3'

import { baseResumeSchema } from '../../../schemas/resume'
import { createBaseResume } from '../../../services/resume.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = baseResumeSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const resume = await createBaseResume(body.data)
  if (!resume) return apiError(event, 409, 'BASE_RESUME_EXISTS', 'A base resume already exists.')
  return apiSuccess(event, resume, 201)
})
