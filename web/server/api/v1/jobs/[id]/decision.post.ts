import { defineEventHandler, getRouterParam } from 'h3'

import { jobIdSchema } from '../../../../schemas/job-library'
import { markJobNotSuitable } from '../../../../services/job-library.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

// 标记岗位「不合适」。这里刻意不再要求管理员：判断是每个人自己的事，
// 而且写的是按用户的 JobDecision，不会影响别人看到的内容。
export default defineEventHandler(async (event) => {
  const parsed = jobIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!parsed.success) return validationError(event, parsed.error.issues)
  const decision = await markJobNotSuitable(parsed.data.id)
  if (!decision) return apiError(event, 404, 'JOB_NOT_FOUND', 'Job was not found.')
  return apiSuccess(event, decision)
})
