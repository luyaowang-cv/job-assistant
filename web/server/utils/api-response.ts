import { getHeader, setResponseStatus, type H3Event } from 'h3'

// Validation libraries expose structured issues with differing object shapes.
// The response contract guarantees a JSON array, without forcing routes to
// coerce or lose Zod's path/code/message metadata.
type ErrorDetail = unknown

function requestId(event: H3Event) {
  return getHeader(event, 'x-request-id') ?? crypto.randomUUID()
}

export function apiSuccess<T>(event: H3Event, data: T, status = 200) {
  setResponseStatus(event, status)
  return {
    data,
    meta: { requestId: requestId(event) },
  }
}

export function apiError(
  event: H3Event,
  status: number,
  code: string,
  message: string,
  details: ErrorDetail[] = [],
) {
  setResponseStatus(event, status)
  return {
    error: { code, message, details },
    meta: { requestId: requestId(event) },
  }
}

export function validationError(event: H3Event, details: ErrorDetail[]) {
  return apiError(event, 400, 'VALIDATION_ERROR', 'Request validation failed.', details)
}
