import { routeDocumentIdsSchema } from '../../../../../schemas/document-composition'
import { variantSuggestionPreviewSchema } from '../../../../../schemas/resume-variant-suggestion'
import { previewResumeVariantSuggestions, ResumeSuggestionError } from '../../../../../services/resume-variant-suggestion.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async event => {
  const route = routeDocumentIdsSchema.pick({ id: true }).safeParse(getRouterParams(event))
  if (!route.success) return validationError(event, route.error.issues)
  const body = variantSuggestionPreviewSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  try { return apiSuccess(event, await previewResumeVariantSuggestions(route.data.id, body.data)) }
  catch (error) {
    if (error instanceof ResumeSuggestionError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'RESUME_SUGGESTION_FAILED', '岗位适配文案生成失败。')
  }
})
