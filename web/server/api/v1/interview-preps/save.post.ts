import { defineEventHandler, readBody } from 'h3'

import { interviewPrepSaveSchema } from '../../../schemas/interview-prep'
import { saveInterviewPrep } from '../../../services/interview-prep.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = interviewPrepSaveSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const saved = await saveInterviewPrep(body.data)
  if (!saved) return apiError(event, 404, 'RESUME_VERSION_NOT_FOUND', 'Resume version not found.')
  return apiSuccess(event, saved)
})