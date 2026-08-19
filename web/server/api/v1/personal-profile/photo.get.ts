import { getPersonalProfilePhoto } from '../../../services/personal-profile.service'
import { apiError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const photo = await getPersonalProfilePhoto()
  if (!photo?.photoData || !photo.photoMimeType) return apiError(event, 404, 'PHOTO_NOT_FOUND', '尚未上传证件照。')
  setHeader(event, 'content-type', photo.photoMimeType)
  setHeader(event, 'cache-control', 'private, no-store')
  return Buffer.from(photo.photoData)
})
