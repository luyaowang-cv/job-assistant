import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { impactPreviewSchema, routeDocumentIdsSchema } from '../../../../schemas/document-composition'
import { previewMaterialImpact } from '../../../../services/document-impact.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = impactPreviewSchema.safeParse(await readBody(event))
  if (!route.success || !body.success) return validationError(event, [...(!route.success ? route.error.issues : []), ...(!body.success ? body.error.issues : [])])
  const result = await previewMaterialImpact(route.data.id, body.data.mode, body.data.targetTags)
  return result ? apiSuccess(event, result) : apiError(event, 404, 'MATERIAL_CARD_NOT_FOUND', 'Active material card with a variant not found.')
})
