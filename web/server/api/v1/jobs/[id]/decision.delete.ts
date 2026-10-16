import { defineEventHandler, getRouterParam } from 'h3'

import { jobIdSchema } from '../../../../schemas/job-library'
import { clearJobDecision } from '../../../../services/job-library.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

// 撤销「不合适」，岗位回到默认列表。没标记过时返回 404，前端按幂等处理即可。
export default defineEventHandler(async (event) => {
  const parsed = jobIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!parsed.success) return validationError(event, parsed.error.issues)
  const cleared = await clearJobDecision(parsed.data.id)
  if (!cleared) return apiError(event, 404, 'JOB_DECISION_NOT_FOUND', 'This job has no decision to clear.')
  return apiSuccess(event, cleared)
})
