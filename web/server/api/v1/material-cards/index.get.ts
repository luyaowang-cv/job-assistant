import { defineEventHandler, getQuery } from 'h3'
import { materialCardListQuerySchema } from '../../../schemas/material-card'
import { listMaterialCards } from '../../../services/material-card.service'
import { apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = materialCardListQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) return validationError(event, parsed.error.issues)
  return apiSuccess(event, await listMaterialCards(parsed.data))
})
