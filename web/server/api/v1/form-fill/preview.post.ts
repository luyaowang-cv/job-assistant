import { defineEventHandler, readBody } from 'h3'

import { formFillPreviewSchema, isAiFillEligibleField } from '../../../schemas/form-fill'
import { FormFillProviderError, previewAiFormFill } from '../../../services/form-fill-provider.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = formFillPreviewSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const fields = body.data.fields.filter(isAiFillEligibleField)
  if (fields.length === 0) {
    return apiSuccess(event, { fills: [], unresolvedIds: [], provider: 'local', model: 'field-filter' })
  }
  try {
    return apiSuccess(event, await previewAiFormFill({ ...body.data, fields }))
  }
  catch (error) {
    if (error instanceof FormFillProviderError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'FORM_FILL_FAILED', 'AI 填写服务暂时不可用。')
  }
})
