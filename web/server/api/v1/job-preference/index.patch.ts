import { defineEventHandler, readBody } from 'h3'

import { updateJobPreferenceSchema } from '../../../schemas/job-evaluation'
import { updateJobPreference } from '../../../services/job-evaluation.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = updateJobPreferenceSchema.safeParse(await readBody(event))

  if (!parsed.success) {
    return validationError(event, parsed.error.issues)
  }

  return apiSuccess(event, await updateJobPreference(parsed.data))
})
