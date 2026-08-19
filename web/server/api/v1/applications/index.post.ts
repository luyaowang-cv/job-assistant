import { defineEventHandler, readBody } from 'h3'

import { createApplicationSchema } from '../../../schemas/application'
import { createApplication } from '../../../services/application.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = createApplicationSchema.safeParse(await readBody(event))

  if (!parsed.success) {
    return validationError(event, parsed.error.issues)
  }

  return apiSuccess(event, await createApplication(parsed.data), 201)
})
