import { defineEventHandler, getRouterParam } from 'h3'

import { applicationProfileIdSchema } from '../../../../schemas/application-profile'
import { getApplicationProfileFillContext } from '../../../../services/application-profile.service'
import { apiError, apiSuccess, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = applicationProfileIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!id.success) return validationError(event, id.error.issues)
  const context = await getApplicationProfileFillContext(id.data.id)
  if (!context) return apiError(event, 404, 'APPLICATION_PROFILE_NOT_FOUND', 'Application profile was not found.')
  // 只回插件真正会读的那一份。
  //
  // `aiContext` 曾经也一起回给浏览器，但插件从头到尾没读过它（`main.ts` 里只有个类型声明）：
  // AI 填充是插件把 profileId 发到 /form-fill/preview|stream，**服务端自己按 id 重新取上下文**。
  // 而 aiContext 是 localFacts 的超集（同样的 basics/references/blocks 再列一遍，外加整份简历正文），
  // 所以这一次返回等于把整份档案传了两遍。现在只回 localFacts，响应体积小一半。
  return apiSuccess(event, { profileName: context.profileName, localFacts: context.localFacts })
})
