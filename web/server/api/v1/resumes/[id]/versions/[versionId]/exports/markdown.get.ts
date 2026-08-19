import { defineEventHandler, getRouterParam, setHeader } from 'h3'
import { routeDocumentIdsSchema } from '../../../../../../../schemas/document-composition'
import { exportResumeMarkdown } from '../../../../../../../services/document-export.service'
import { apiError, validationError } from '../../../../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const route = routeDocumentIdsSchema.safeParse({ id: getRouterParam(event, 'id'), versionId: getRouterParam(event, 'versionId') })
  if (!route.success || !route.data.versionId) return validationError(event, route.success ? [] : route.error.issues)
  const markdown = await exportResumeMarkdown(route.data.id, route.data.versionId)
  if (markdown == null) return apiError(event, 404, 'RESUME_VERSION_NOT_FOUND', 'Resume version not found.')
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="resume-${route.data.versionId}.md"`)
  return markdown
})
