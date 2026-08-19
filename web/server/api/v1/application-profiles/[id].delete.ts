import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'

import { deleteApplicationProfile } from '../../../services/application-profile.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = z.string().trim().min(1).max(64).safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) return validationError(event, parsed.error.issues)
  const deleted = await deleteApplicationProfile(parsed.data)
  if (!deleted) return apiError(event, 404, 'APPLICATION_PROFILE_NOT_FOUND', 'Application profile not found or already deleted.')
  return apiSuccess(event, deleted)
})