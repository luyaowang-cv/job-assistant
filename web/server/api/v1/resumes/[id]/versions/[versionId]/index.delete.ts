import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'

import { deleteResumeVersion } from '../../../../../../services/resume.service'
import { apiError, apiSuccess, validationError } from '../../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const resumeId = z.string().trim().min(1).max(64).safeParse(getRouterParam(event, 'id'))
  const versionId = z.string().trim().min(1).max(64).safeParse(getRouterParam(event, 'versionId'))
  if (!resumeId.success || !versionId.success) return validationError(event, [...(resumeId.success ? [] : resumeId.error.issues), ...(versionId.success ? [] : versionId.error.issues)])
  const deleted = await deleteResumeVersion(resumeId.data, versionId.data)
  if (!deleted) return apiError(event, 404, 'RESUME_VERSION_NOT_FOUND', 'Resume version not found, is not TARGETED, or already deleted.')
  return apiSuccess(event, deleted)
})