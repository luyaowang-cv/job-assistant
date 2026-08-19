import { defineEventHandler } from 'h3'
import { getPersonalProfile } from '../../../services/personal-profile.service'
import { apiSuccess } from '../../../utils/api-response'

export default defineEventHandler(async event => apiSuccess(event, await getPersonalProfile()))
