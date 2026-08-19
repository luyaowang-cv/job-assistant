import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { createApplicationProfileVersionSchema, routeDocumentIdsSchema } from '../../../../../schemas/document-composition'
import { createApplicationProfileVersion } from '../../../../../services/document-composition.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = createApplicationProfileVersionSchema.safeParse(await readBody(event))
  if (!route.success || !body.success) return validationError(event, [...(!route.success ? route.error.issues : []), ...(!body.success ? body.error.issues : [])])
  const result = await createApplicationProfileVersion(route.data.id, body.data)
  return result ? apiSuccess(event, result, 201) : apiError(event, 400, 'INVALID_DOCUMENT_REFERENCE', 'Profile or material reference is invalid.')
})
