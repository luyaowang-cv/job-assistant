import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { createComposedResumeVersionSchema, routeDocumentIdsSchema } from '../../../../schemas/document-composition'
import { createComposedResumeVersion } from '../../../../services/document-composition.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = createComposedResumeVersionSchema.safeParse(await readBody(event))
  if (!route.success || !body.success) return validationError(event, [...(!route.success ? route.error.issues : []), ...(!body.success ? body.error.issues : [])])
  const result = await createComposedResumeVersion(route.data.id, body.data.composition, body.data.name)
  return result ? apiSuccess(event, result, 201) : apiError(event, 400, 'INVALID_DOCUMENT_REFERENCE', 'Resume or material reference is invalid.')
})
