import { defineEventHandler, readBody } from 'h3'

import { aiProviderTestSchema } from '../../../schemas/ai-settings'
import { testAiProviderConnection } from '../../../services/ai-provider-setting.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

/**
 * One minimal request to the configured provider, reported as data.
 *
 * Always answers 200 with a result object even when the provider refused: the page
 * needs the status, the requested URL and the upstream's own words side by side,
 * and an error response would collapse all three into one message.
 */
export default defineEventHandler(async (event) => {
  const body = aiProviderTestSchema.safeParse((await readBody(event)) ?? {})
  if (!body.success) return validationError(event, body.error.issues)
  return apiSuccess(event, await testAiProviderConnection(body.data))
})
