import { defineEventHandler, readBody } from 'h3'

import { feishuImportSchema } from '../../../../schemas/job-library'
import { importFeishuJobs, JobLibraryImportError } from '../../../../services/job-library.service'
import { FeishuOAuthError } from '../../../../services/feishu-oauth.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = feishuImportSchema.safeParse(await readBody(event))
  if (!parsed.success) return validationError(event, parsed.error.issues)
  try {
    return apiSuccess(event, await importFeishuJobs(parsed.data))
  }
  catch (error) {
    if (error instanceof JobLibraryImportError || error instanceof FeishuOAuthError) return apiError(event, 422, error.code, error.message)
    throw error
  }
})
