import { compositionInputSchema, routeDocumentIdsSchema } from '../../../../schemas/document-composition'
import { previewA4Resume } from '../../../../services/resume-a4.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async event => {
  const route = routeDocumentIdsSchema.pick({ id: true }).safeParse(getRouterParams(event))
  if (!route.success) return validationError(event, route.error.issues)
  const body = compositionInputSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const preview = await previewA4Resume(route.data.id, body.data)
  return preview ? apiSuccess(event, preview) : apiError(event, 400, 'INVALID_DOCUMENT_REFERENCE', '简历或素材引用无效。')
})
