import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { documentSyncSchema, routeDocumentIdsSchema } from '../../../../schemas/document-composition'
import { confirmMaterialSync } from '../../../../services/document-impact.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = documentSyncSchema.safeParse(await readBody(event))
  if (!route.success || !body.success) return validationError(event, [...(!route.success ? route.error.issues : []), ...(!body.success ? body.error.issues : [])])
  const result = await confirmMaterialSync(route.data.id, body.data.previewToken, body.data.idempotencyKey, body.data.targetIds)
  return result ? apiSuccess(event, result) : apiError(event, 400, 'INVALID_PREVIEW_TOKEN', 'Preview token is invalid or expired.')
})
