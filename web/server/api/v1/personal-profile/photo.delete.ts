import { deletePersonalProfilePhoto } from '../../../services/personal-profile.service'
import { apiError, apiSuccess } from '../../../utils/api-response'

export default defineEventHandler(async event => {
  const profile = await deletePersonalProfilePhoto()
  return profile ? apiSuccess(event, profile) : apiError(event, 404, 'PROFILE_NOT_FOUND', '请先保存个人档案。')
})
