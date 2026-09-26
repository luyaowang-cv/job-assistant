import { defineEventHandler, readBody } from 'h3'

import { openQuestionAnswerSchema } from '../../../schemas/open-question'
import { OpenQuestionProviderError, answerOpenQuestion } from '../../../services/open-question.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const body = openQuestionAnswerSchema.safeParse(await readBody(event))
  if (!body.success) return validationError(event, body.error.issues)
  try {
    return apiSuccess(event, await answerOpenQuestion(body.data))
  }
  catch (error) {
    if (error instanceof OpenQuestionProviderError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'OPEN_QUESTION_FAILED', 'AI 回答服务暂时不可用。')
  }
})
