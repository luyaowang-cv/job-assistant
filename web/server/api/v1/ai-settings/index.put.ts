import { defineEventHandler, readBody } from 'h3'

import { aiProviderSettingSchema } from '../../../schemas/ai-settings'
import { saveAiProviderSetting } from '../../../services/ai-provider-setting.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = aiProviderSettingSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  return apiSuccess(event, await saveAiProviderSetting(body.data))
})
