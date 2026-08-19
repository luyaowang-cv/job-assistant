import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { materialCardIdSchema, materialVariantInputSchema } from '../../../../schemas/material-card'
import { addMaterialVariant } from '../../../../services/material-card.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = materialCardIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = materialVariantInputSchema.safeParse(await readBody(event))
  if (!id.success || !body.success) return validationError(event, [...(!id.success ? id.error.issues : []), ...(!body.success ? body.error.issues : [])])
  try {
    const result = await addMaterialVariant(id.data.id, body.data)
    return result ? apiSuccess(event, result, 201) : apiError(event, 404, 'MATERIAL_CARD_NOT_FOUND', 'Active material card not found.')
  } catch {
    return apiError(event, 409, 'MATERIAL_VARIANT_NAME_EXISTS', 'A variant with this name already exists.')
  }
})
