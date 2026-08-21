import { defineEventHandler, readBody } from 'h3'
import { careerAgentConversationCreateSchema } from '../../../../schemas/career-agent-conversation'
import { createCareerAgentConversation } from '../../../../services/career-agent-conversation.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = careerAgentConversationCreateSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  const conversation = await createCareerAgentConversation(body.data)
  if (!conversation) return apiError(event, 404, 'CONTEXT_NOT_FOUND', 'Application or resume version context not found.')
  return apiSuccess(event, conversation, 201)
})
