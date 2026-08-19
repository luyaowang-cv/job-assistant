import { defineEventHandler, getRouterParam } from 'h3'
import { routeDocumentIdsSchema } from '../../../../../../schemas/document-composition'
import { resolveResumeVersion } from '../../../../../../services/document-composition.service'
import { apiError, apiSuccess, validationError } from '../../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id'), versionId: getRouterParam(event, 'versionId') })
  if (!route.success || !route.data.versionId) return validationError(event, route.success ? [] : route.error.issues)
  const result = await resolveResumeVersion(route.data.id, route.data.versionId)
  return result ? apiSuccess(event, result) : apiError(event, 404, 'RESUME_VERSION_NOT_FOUND', 'Resume version not found.')
})
