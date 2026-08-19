import { routeDocumentIdsSchema } from '../../../../../schemas/document-composition'
import { variantSuggestionConfirmSchema } from '../../../../../schemas/resume-variant-suggestion'
import { confirmResumeVariantSuggestions } from '../../../../../services/resume-variant-suggestion.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async event => {
  const route = routeDocumentIdsSchema.pick({ id: true }).safeParse(getRouterParams(event))
  if (!route.success) return validationError(event, route.error.issues)
  const body = variantSuggestionConfirmSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const result = await confirmResumeVariantSuggestions(route.data.id, body.data.previewToken, body.data.selectedSuggestionIds, body.data.idempotencyKey)
  return result ? apiSuccess(event, result, result.replayed ? 200 : 201) : apiError(event, 409, 'SUGGESTION_CONFIRMATION_INVALID', '预览已过期、被篡改或素材版本已变化。')
})
