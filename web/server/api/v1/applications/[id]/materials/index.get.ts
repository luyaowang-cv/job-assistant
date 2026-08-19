import { defineEventHandler, getRouterParam } from 'h3'

import { applicationIdSchema } from '../../../../../schemas/application'
import { getMaterialApplicationContext, listApplicationMaterials } from '../../../../../services/application-materials.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = applicationIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!id.success) return validationError(event, id.error.issues)
  if (!await getMaterialApplicationContext(id.data.id)) return apiError(event, 404, 'APPLICATION_NOT_FOUND', 'Application was not found.')
  return apiSuccess(event, await listApplicationMaterials(id.data.id))
})
