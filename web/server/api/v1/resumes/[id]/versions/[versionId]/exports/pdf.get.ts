import { routeDocumentIdsSchema } from '../../../../../../../schemas/document-composition'
import { exportResumePdf, ResumePdfError } from '../../../../../../../services/resume-a4.service'
import { apiError, validationError } from '../../../../../../../utils/api-response'

export default defineEventHandler(async event => {
  const route = routeDocumentIdsSchema.safeParse(getRouterParams(event))
  if (!route.success) return validationError(event, route.error.issues)
  if (!route.data.versionId) return apiError(event, 400, 'VERSION_ID_REQUIRED', '缺少简历版本 ID。')
  try {
    const result = await exportResumePdf(route.data.id, route.data.versionId)
    if (!result) return apiError(event, 404, 'RESUME_VERSION_NOT_FOUND', '简历版本不存在。')
    setHeader(event, 'content-type', 'application/pdf')
    setHeader(event, 'content-disposition', `attachment; filename="resume-${route.data.versionId}.pdf"`)
    setHeader(event, 'x-resume-page-count', String(result.pageCount))
    return result.pdf
  } catch (error) {
    if (error instanceof ResumePdfError) return apiError(event, error.statusCode, error.code, error.message)
    return apiError(event, 500, 'PDF_EXPORT_FAILED', 'PDF 导出失败，请稍后重试。')
  }
})
