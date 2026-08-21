import { defineEventHandler, readBody, sendStream, setHeader } from 'h3'
import { careerAgentChatSchema } from '../../../schemas/career-agent'
import { CareerAgentContextError, streamCareerAgent } from '../../../services/career-agent.service'
import { AiTextStreamError } from '../../../services/openai-compatible-text.service'
import { apiError, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = careerAgentChatSchema.safeParse(await readBody(event))
  if (!parsed.success) return validationError(event, parsed.error.issues)

  try {
    const generated = await streamCareerAgent(parsed.data)
    setHeader(event, 'content-type', 'application/x-ndjson; charset=utf-8')
    setHeader(event, 'cache-control', 'no-cache, no-transform')
    setHeader(event, 'x-accel-buffering', 'no')
    setHeader(event, 'x-ai-provider', generated.provider)
    setHeader(event, 'x-ai-model', generated.model)
    return sendStream(event, generated.stream)
  }
  catch (error) {
    if (error instanceof CareerAgentContextError || error instanceof AiTextStreamError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'CAREER_AGENT_FAILED', '求职 Agent 暂时无法生成回答。')
  }
})
