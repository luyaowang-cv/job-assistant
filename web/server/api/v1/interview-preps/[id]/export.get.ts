import { defineEventHandler, getRouterParam, setHeader } from 'h3'
import { z } from 'zod'

import { exportInterviewPrepMarkdown } from '../../../../services/interview-prep.service'
import { apiError, validationError } from '../../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const parsed = z.string().trim().min(1).max(64).safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) return validationError(event, parsed.error.issues)
  const markdown = await exportInterviewPrepMarkdown(parsed.data)
  if (markdown == null) return apiError(event, 404, 'INTERVIEW_PREP_NOT_FOUND', 'Interview prep document not found.')
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="interview-prep-${parsed.data}.md"`)
  return markdown
})