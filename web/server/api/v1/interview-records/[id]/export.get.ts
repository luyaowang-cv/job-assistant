import { defineEventHandler, getRouterParam, setHeader } from 'h3'

import { interviewRecordIdSchema } from '../../../../schemas/interview-record'
import { exportInterviewRecordMarkdown } from '../../../../services/interview-record.service'
import { apiError, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const id = interviewRecordIdSchema.safeParse({ id: getRouterParam(event, 'id') })
  if (!id.success) return validationError(event, id.error.issues)
  const markdown = await exportInterviewRecordMarkdown(id.data.id)
  if (markdown == null) return apiError(event, 404, 'INTERVIEW_RECORD_NOT_FOUND', 'Interview record not found.')
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="interview-record-${id.data.id}.md"`)
  return markdown
})