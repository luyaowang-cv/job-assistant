import { defineEventHandler } from 'h3'
import { listApplicationProfiles } from '../../../services/application-profile.service'
import { apiSuccess } from '../../../utils/api-response'
export default defineEventHandler(async event => apiSuccess(event, await listApplicationProfiles()))
