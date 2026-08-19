import { defineEventHandler, readBody } from 'h3'

import { resumeVersionSchema } from '../../../schemas/resume'
import { createTargetedResumeVersion } from '../../../services/resume.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = resumeVersionSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const version = await createTargetedResumeVersion(body.data)
  if (!version) return apiError(event, 404, 'RESUME_OR_APPLICATION_NOT_FOUND', 'Resume or source application was not found.')
  return apiSuccess(event, version, 201)
})
