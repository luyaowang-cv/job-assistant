import { defineEventHandler, readMultipartFormData } from 'h3'

import { importExcelJobs, JobLibraryImportError } from '../../../../services/job-library.service'
import { apiError, apiSuccess } from '../../../../utils/api-response'

const MAX_EXCEL_BYTES = 10 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file?.data) return apiError(event, 400, 'EXCEL_REQUIRED', '请选择要上传的 Excel 文件。')
  if (file.data.byteLength > MAX_EXCEL_BYTES) return apiError(event, 413, 'EXCEL_TOO_LARGE', 'Excel 文件不能超过 10 MiB。')
  const filename = file.filename ?? 'jobs.xlsx'
  if (!/\.xlsx$/i.test(filename)) return apiError(event, 415, 'EXCEL_TYPE_UNSUPPORTED', '仅支持 .xlsx 格式的 Excel 文件。')
  try {
    return apiSuccess(event, await importExcelJobs(file.data, filename))
  }
  catch (error) {
    if (error instanceof JobLibraryImportError) return apiError(event, 422, error.code, error.message)
    throw error
  }
})
