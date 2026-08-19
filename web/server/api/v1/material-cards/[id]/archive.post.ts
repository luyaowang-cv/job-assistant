import { defineEventHandler, getRouterParam } from 'h3'
import { materialCardIdSchema } from '../../../../schemas/material-card'
import { archiveMaterialCard } from '../../../../services/material-card.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = materialCardIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!id.success) return validationError(event, id.error.issues)
  const result = await archiveMaterialCard(id.data.id)
  return result ? apiSuccess(event, result) : apiError(event, 404, 'MATERIAL_CARD_NOT_FOUND', 'Active material card not found.')
})
