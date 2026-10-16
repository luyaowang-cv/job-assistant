import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { applicationFromJobBodySchema, jobIdSchema } from '../../../../schemas/job-library'
import { createApplicationFromJob } from '../../../../services/job-library.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

// 岗位库 → 投递看板。默认按「已投递」建记录（投递日期取当天）；
// 传 status: 'SAVED' 则只收藏进看板，不补投递日期。
export default defineEventHandler(async (event) => {
  const parsedId = jobIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!parsedId.success) return validationError(event, parsedId.error.issues)
  const parsedBody = applicationFromJobBodySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsedBody.success) return validationError(event, parsedBody.error.issues)
  const result = await createApplicationFromJob(parsedId.data.id, parsedBody.data.status)
  if (!result) return apiError(event, 404, 'JOB_NOT_FOUND', 'Job was not found.')
  return apiSuccess(event, result, result.created ? 201 : 200)
})
