import { defineEventHandler, getRouterParam } from 'h3'
import { careerAgentConversationIdSchema } from '../../../../schemas/career-agent-conversation'
import { getCareerAgentConversation } from '../../../../services/career-agent-conversation.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const params = careerAgentConversationIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!params.success) return validationError(event, params.error.issues)
  const conversation = await getCareerAgentConversation(params.data.id)
  if (!conversation) return apiError(event, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.')
  return apiSuccess(event, conversation)
})
