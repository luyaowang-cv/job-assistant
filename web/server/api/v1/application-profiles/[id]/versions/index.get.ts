import { defineEventHandler, getRouterParam } from 'h3'
import { routeDocumentIdsSchema } from '../../../../../schemas/document-composition'
import { listApplicationProfileVersions } from '../../../../../services/document-composition.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!route.success) return validationError(event, route.error.issues)
  const result = await listApplicationProfileVersions(route.data.id)
  return result ? apiSuccess(event, result) : apiError(event, 404, 'APPLICATION_PROFILE_NOT_FOUND', 'Application profile not found.')
})
