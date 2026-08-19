import { defineEventHandler, readBody } from 'h3'
import { createMaterialCardSchema } from '../../../schemas/material-card'
import { createMaterialCard } from '../../../services/material-card.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = createMaterialCardSchema.safeParse(await readBody(event))
  if (!parsed.success) return validationError(event, parsed.error.issues)
  return apiSuccess(event, await createMaterialCard(parsed.data), 201)
})
