import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { careerAgentConversationIdSchema, careerAgentSaveToInterviewSchema } from '../../../../../schemas/career-agent-conversation'
import { saveAgentMessageToInterview } from '../../../../../services/career-agent-conversation.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const params = careerAgentConversationIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = careerAgentSaveToInterviewSchema.safeParse(await readBody(event))
  if (!params.success) return validationError(event, params.error.issues)
  if (!body.success) return validationError(event, body.error.issues)
  const saved = await saveAgentMessageToInterview(params.data.id, body.data)
  if (!saved) return apiError(event, 404, 'AGENT_MESSAGE_NOT_FOUND', 'Assistant message not found.')
  return apiSuccess(event, saved, 201)
})
