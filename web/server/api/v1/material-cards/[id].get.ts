import { defineEventHandler, getRouterParam } from 'h3'
import { materialCardIdSchema } from '../../../schemas/material-card'
import { getMaterialCard } from '../../../services/material-card.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = materialCardIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!parsed.success) return validationError(event, parsed.error.issues)
  const card = await getMaterialCard(parsed.data.id)
  return card ? apiSuccess(event, card) : apiError(event, 404, 'MATERIAL_CARD_NOT_FOUND', 'Material card not found.')
})
