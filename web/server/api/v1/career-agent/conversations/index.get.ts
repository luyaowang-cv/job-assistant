import { defineEventHandler } from 'h3'
import { listCareerAgentConversations } from '../../../../services/career-agent-conversation.service'
import { apiSuccess } from '../../../../utils/api-response'

export default defineEventHandler(async event => apiSuccess(event, await listCareerAgentConversations()))
