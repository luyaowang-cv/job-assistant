import { defineEventHandler } from 'h3'

import { disconnectFeishu } from '../../../../services/feishu-oauth.service'
import { apiSuccess } from '../../../../utils/api-response'

export default defineEventHandler(async event => apiSuccess(event, await disconnectFeishu()))
