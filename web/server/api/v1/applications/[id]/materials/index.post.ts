import { defineEventHandler, getRouterParam, readBody } from 'h3'

import { applicationIdSchema } from '../../../../../schemas/application'
import { saveApplicationMaterialsSchema } from '../../../../../schemas/application-materials'
import { getAiProviderSetting } from '../../../../../services/ai-provider-setting.service'
import { saveApplicationMaterials } from '../../../../../services/application-materials.service'
import { apiError, apiSuccess, validationError } from '../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = applicationIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  const body = saveApplicationMaterialsSchema.safeParse(await readBody(event))
  if (!id.success) return validationError(event, id.error.issues)
  if (!body.success) return validationError(event, body.error.issues)

  const identity = await getAiProviderSetting()
  const material = await saveApplicationMaterials(id.data.id, body.data, identity.provider, identity.model)
  if (!material) return apiError(event, 404, 'APPLICATION_NOT_FOUND', 'Application or evaluation was not found.')
  return apiSuccess(event, material, 201)
})
