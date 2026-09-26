import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { careerAgentConversationIdSchema, careerAgentStoredMessageSchema } from '../../../../../schemas/career-agent-conversation'
import { addCareerAgentMessage } from '../../../../../services/career-agent-conversation.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const params = careerAgentConversationIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = careerAgentStoredMessageSchema.safeParse(await readBody(event))
  if (!params.success) return validationError(event, params.error.issues)
  if (!body.success) return validationError(event, body.error.issues)
  const message = await addCareerAgentMessage(params.data.id, body.data)
  if (!message) return apiError(event, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.')
  return apiSuccess(event, message, 201)
})
