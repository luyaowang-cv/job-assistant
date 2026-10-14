import { defineEventHandler, readBody, sendStream, setHeader } from 'h3'

import { formFillPreviewSchema, isAiFillEligibleField } from '../../../schemas/form-fill'
import { FormFillProviderError, streamAiFormFill } from '../../../services/form-fill-provider.service'
import { apiError, validationError } from '../../../utils/api-response'

/**
 * Fills a whole form in one streamed request.
 *
 * The batch endpoint stays for the popup to fall back on, but this is the path
 * meant to be used: one call per form instead of one per batch, every answer
 * handed over the moment it is written, and no per-minute allowance to trip.
 */
export default defineEventHandler(async (event) => {
  const body = formFillPreviewSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const fields = body.data.fields.filter(isAiFillEligibleField)

  try {
    const generated = await streamAiFormFill({ ...body.data, fields })
    setHeader(event, 'content-type', 'application/x-ndjson; charset=utf-8')
    setHeader(event, 'cache-control', 'no-cache, no-transform')
    // Tells any proxy in front of this not to sit on the response until it ends.
    setHeader(event, 'x-accel-buffering', 'no')
    setHeader(event, 'x-ai-provider', generated.provider)
    setHeader(event, 'x-ai-model', generated.model)
    return sendStream(event, generated.stream)
  }
  catch (error) {
    if (error instanceof FormFillProviderError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'FORM_FILL_FAILED', 'AI 填写服务暂时不可用。')
  }
})
