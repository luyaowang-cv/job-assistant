import { defineEventHandler, getRouterParam } from 'h3'
import { careerAgentConversationIdSchema } from '../../../../schemas/career-agent-conversation'
import { deleteCareerAgentConversation } from '../../../../services/career-agent-conversation.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const params = careerAgentConversationIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!params.success) return validationError(event, params.error.issues)
  if (!(await deleteCareerAgentConversation(params.data.id))) return apiError(event, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.')
  return apiSuccess(event, { deleted: true })
})
