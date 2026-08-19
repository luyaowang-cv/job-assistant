import { defineEventHandler, getQuery, sendRedirect } from 'h3'

import { completeFeishuAuthorization, FeishuOAuthError } from '../../../../services/feishu-oauth.service'
import { feishuOAuthCallbackSchema } from '../../../../schemas/feishu-oauth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const parsed = feishuOAuthCallbackSchema.safeParse(query)
  if (!parsed.success) return sendRedirect(event, '/jobs?feishu=error')
  try {
    await completeFeishuAuthorization(parsed.data.code, parsed.data.state)
    return sendRedirect(event, '/jobs?feishu=connected')
  }
  catch (error) {
    if (error instanceof FeishuOAuthError) return sendRedirect(event, `/jobs?feishu=error&reason=${encodeURIComponent(error.message)}`)
    throw error
  }
})
