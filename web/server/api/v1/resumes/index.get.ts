import { defineEventHandler } from 'h3'

import { getResume } from '../../../services/resume.service'
import { apiSuccess } from '../../../utils/api-response'

export default defineEventHandler(async (event) => apiSuccess(event, await getResume()))
