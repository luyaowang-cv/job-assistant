import { defineEventHandler, readBody } from 'h3'

import { formFillPreviewSchema } from '../../../schemas/form-fill'
import { FormFillProviderError, previewAiFormFill } from '../../../services/form-fill-provider.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = formFillPreviewSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  try {
    return apiSuccess(event, await previewAiFormFill(body.data))
  }
  catch (error) {
    if (error instanceof FormFillProviderError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'FORM_FILL_FAILED', 'AI 填写服务暂时不可用。')
  }
})
