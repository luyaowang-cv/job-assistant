import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { materialCardIdSchema, updateMaterialCardSchema } from '../../../schemas/material-card'
import { updateMaterialCard } from '../../../services/material-card.service'
import { apiError, apiSuccess, validationError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = materialCardIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = updateMaterialCardSchema.safeParse(await readBody(event))
  if (!id.success || !body.success) return validationError(event, [...(!id.success ? id.error.issues : []), ...(!body.success ? body.error.issues : [])])
  const result = await updateMaterialCard(id.data.id, body.data)
  return result ? apiSuccess(event, result) : apiError(event, 404, 'MATERIAL_CARD_NOT_FOUND', 'Active material card not found.')
})
