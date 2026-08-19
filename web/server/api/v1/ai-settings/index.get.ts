import { defineEventHandler } from 'h3'

import { getAiProviderSetting } from '../../../services/ai-provider-setting.service'
import { apiSuccess } from '../../../utils/api-response'

export default defineEventHandler(async (event) => apiSuccess(event, await getAiProviderSetting()))
