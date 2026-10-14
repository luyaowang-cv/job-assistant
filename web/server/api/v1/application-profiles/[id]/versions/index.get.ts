import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { routeDocumentIdsSchema } from '../../../../../schemas/document-composition'
import { listApplicationProfileVersions } from '../../../../../services/document-composition.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

/** Enough for a history view, small enough that the current content can ask for just itself. */
const MAX_LIMIT = 50

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!route.success) return validationError(event, route.error.issues)
  const requested = Number(getQuery(event).limit)
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : undefined
  const result = await listApplicationProfileVersions(route.data.id, { limit })
  return result ? apiSuccess(event, result) : apiError(event, 404, 'APPLICATION_PROFILE_NOT_FOUND', 'Application profile not found.')
})
