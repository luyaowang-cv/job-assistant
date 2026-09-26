import { defineEventHandler } from 'h3'

import { getFeishuConnectionStatus } from '../../../../services/feishu-oauth.service'
import { getFeishuAutoSyncStatus } from '../../../../services/job-library.service'
import { apiSuccess } from '../../../../utils/api-response'

export default defineEventHandler(async event => {
  const [connection, autoSync] = await Promise.all([getFeishuConnectionStatus(), getFeishuAutoSyncStatus()])
  return apiSuccess(event, { ...connection, autoSync })
})
