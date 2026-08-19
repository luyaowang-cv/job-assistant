import { defineEventHandler } from 'h3'
import { documentExportCapabilities } from '../../services/document-export.service'
import { apiSuccess } from '../../utils/api-response'

export default defineEventHandler(event => apiSuccess(event, documentExportCapabilities()))
