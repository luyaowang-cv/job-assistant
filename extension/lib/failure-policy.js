/**
 * When a failed request is worth another try, and how long to wait first.
 *
 * This lives outside the popup because it is the most subtle logic in the fill and
 * was the only part with no tests. Whether a retry waits three seconds or thirty
 * decides whether a rate limit clears or deepens; whether a failure stops the run
 * or only this batch decides whether the applicant loses the rest of a page over
 * one bad request.
 */

/**
 * Carries the response's status and machine-readable code alongside the message
 * the user sees. Without them a caller cannot tell a rate limit — which clears
 * on its own — from a rejected API key, which never will.
 */
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Codes where a second attempt can plausibly succeed. */
export const RETRYABLE_CODES = new Set([
  'NETWORK_UNREACHABLE',
  'AI_PROVIDER_RATE_LIMITED',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_PROVIDER_TIMEOUT',
  // A truncated reply is a sampling accident; the next attempt usually parses.
  'AI_PROVIDER_INVALID_RESPONSE',
])

/**
 * Codes where *every* remaining batch would fail the same way, so sending them is
 * only noise. Everything else is this batch's problem: a rejected batch is not a
 * reason to abandon the rest of the form, which is what used to happen.
 */
export const ABORTING_CODES = new Set([
  'AI_KEY_INVALID',
  'AI_KEY_NOT_CONFIGURED',
  'UNAUTHORIZED',
  'EMAIL_NOT_VERIFIED',
])

/**
 * How long to wait before re-sending a batch that failed.
 *
 * A dropped connection clears in a second or two. A rate limit does not: the
 * allowance reopens on a per-minute clock, so retrying after one second is not
 * only certain to fail, it is one more request against the very limit that is
 * being hit — which is how a single 429 becomes a run of them.
 */
export const FILL_RETRY_DELAYS_MS = [1_000, 3_000]
export const FILL_RATE_LIMIT_DELAYS_MS = [15_000, 30_000]

/** How long to wait before attempt `attempt + 1` of a failed batch. */
export function retryDelayFor(error, attempt) {
  const delays = error instanceof ApiError && error.code === 'AI_PROVIDER_RATE_LIMITED'
    ? FILL_RATE_LIMIT_DELAYS_MS
    : FILL_RETRY_DELAYS_MS
  return delays[attempt]
}

export function isRetryable(error) {
  if (!(error instanceof ApiError)) return false
  if (RETRYABLE_CODES.has(error.code)) return true
  // An unrecognised 5xx is the workbench itself failing, which is worth one more
  // try. An unrecognised 4xx is this request being wrong, which is not.
  return !error.code && error.status >= 500
}

/**
 * A request that ran out the client's own clock is deliberately not retried, which
 * is why `NETWORK_TIMEOUT` is absent from `RETRYABLE_CODES`: it means the workbench
 * was still working after 100 seconds, well past its own 60-second ceiling on the
 * model. Re-sending spends another 100 seconds and another full provider call to
 * ask the same stuck question, so that batch is reported as failed and the rest of
 * the form gets its turn instead. A connection that drops outright arrives as
 * `NETWORK_UNREACHABLE`, which *is* retried.
 */

/** Whether the rest of the form is worth sending after this error. */
export function isGlobalFailure(error) {
  if (!(error instanceof ApiError)) return false
  return ABORTING_CODES.has(error.code) || error.status === 401 || error.status === 403
}
