import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { migrationConfirmSchema, routeDocumentIdsSchema } from '../../../../../schemas/document-composition'
import { confirmLegacyMaterialMigration } from '../../../../../services/legacy-material-migration.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = migrationConfirmSchema.safeParse(await readBody(event))
  if (!route.success || !body.success) return validationError(event, [...(!route.success ? route.error.issues : []), ...(!body.success ? body.error.issues : [])])
  const result = await confirmLegacyMaterialMigration(route.data.id, body.data.sourceKeys)
  return result ? apiSuccess(event, result) : apiError(event, 404, 'APPLICATION_PROFILE_NOT_FOUND', 'Application profile not found.')
})
