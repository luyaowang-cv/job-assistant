import { defineEventHandler, readBody } from 'h3'

import { interviewReflectionConfirmSchema } from '../../../../schemas/interview-prep'
import { confirmInterviewReflection } from '../../../../services/interview-prep.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = interviewReflectionConfirmSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const confirmed = await confirmInterviewReflection(body.data)
  if (!confirmed) return apiError(event, 404, 'RESUME_VERSION_NOT_FOUND', 'Resume version not found.')
  return apiSuccess(event, confirmed)
})