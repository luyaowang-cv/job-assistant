import { defineEventHandler, sendRedirect } from 'h3'

import { getFeishuAuthorizationUrl, FeishuOAuthError } from '../../../../services/feishu-oauth.service'
import { apiError } from '../../../../utils/api-response'

export default defineEventHandler((event) => {
  try { return sendRedirect(event, getFeishuAuthorizationUrl()) }
  catch (error) {
    if (error instanceof FeishuOAuthError) return apiError(event, 422, error.code, error.message)
    throw error
  }
})
