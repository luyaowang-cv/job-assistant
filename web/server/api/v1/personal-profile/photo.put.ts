import { readMultipartFormData } from 'h3'
import { savePersonalProfilePhoto } from '../../../services/personal-profile.service'
import { apiError, apiSuccess } from '../../../utils/api-response'
import { detectProfilePhoto, MAX_PHOTO_BYTES } from '../../../utils/profile-photo'

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'photo' && part.filename)
  if (!file?.data) return apiError(event, 400, 'PHOTO_REQUIRED', '请选择证件照文件。')
  if (file.data.byteLength > MAX_PHOTO_BYTES) return apiError(event, 413, 'PHOTO_TOO_LARGE', '证件照不能超过 5 MiB。')
  const mimeType = detectProfilePhoto(file.data)
  if (!mimeType) return apiError(event, 415, 'PHOTO_TYPE_UNSUPPORTED', '仅支持有效的 JPEG、PNG 或 WebP 图片。')
  return apiSuccess(event, await savePersonalProfilePhoto(mimeType, file.data))
})
