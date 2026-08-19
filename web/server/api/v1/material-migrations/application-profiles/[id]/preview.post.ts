import { defineEventHandler, getRouterParam } from 'h3'
import { routeDocumentIdsSchema } from '../../../../../schemas/document-composition'
import { previewLegacyMaterialMigration } from '../../../../../services/legacy-material-migration.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!route.success) return validationError(event, route.error.issues)
  const result = await previewLegacyMaterialMigration(route.data.id)
  return result ? apiSuccess(event, result) : apiError(event, 404, 'APPLICATION_PROFILE_NOT_FOUND', 'Application profile not found.')
})
