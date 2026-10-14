import './style.css'
import {
  clearMemory,
  forgetAnswer,
  listAnswers,
  lookupAnswer,
  readMemory,
  rememberAnswer,
  touchAnswer,
} from '../../lib/answer-memory.js'
import { applyChoiceEntries, applyFillEntries, collectControlValues, scanVisibleFormFields } from '../../lib/form-page-bridge.js'
import { buildFillBatches } from '../../lib/fill-batches.js'
import { countUnreachedFrames, groupByFrame, isChoiceField, qualifyFieldId } from '../../lib/frame-scope.js'
import { buildFillPlan } from '../../lib/form-fill-rules.js'
import {
  appendTurn,
  readThread,
  toRequestMessages,
  writeThread,
} from '../../lib/open-question-thread.js'

const statusElement = document.querySelector<HTMLElement>('#status')
const readPageButton = document.querySelector<HTMLButtonElement>('#read-page')
const saveJobButton = document.querySelector<HTMLButtonElement>('#save-job')
const companyNameInput = document.querySelector<HTMLInputElement>('#company-name')
const jobTitleInput = document.querySelector<HTMLInputElement>('#job-title')
const locationInput = document.querySelector<HTMLInputElement>('#location')
const salaryMinInput = document.querySelector<HTMLInputElement>('#salary-min')
const salaryMaxInput = document.querySelector<HTMLInputElement>('#salary-max')
const jobUrlInput = document.querySelector<HTMLInputElement>('#job-url')
const descriptionInput = document.querySelector<HTMLTextAreaElement>('#description')
const qaThreadElement = document.querySelector<HTMLElement>('#qa-thread')
const qaQuestionInput = document.querySelector<HTMLTextAreaElement>('#qa-question')
const qaPresetsElement = document.querySelector<HTMLElement>('#qa-presets')
const askQuestionButton = document.querySelector<HTMLButtonElement>('#ask-question')
const qaResultElement = document.querySelector<HTMLElement>('#qa-result')
const clearThreadButton = document.querySelector<HTMLButtonElement>('#clear-thread')
const jobResultElement = document.querySelector<HTMLElement>('#job-result')
const applicationProfileSelect = document.querySelector<HTMLSelectElement>('#application-profile')
const refreshProfilesButton = document.querySelector<HTMLButtonElement>('#refresh-profiles')
const fillCurrentPageButton = document.querySelector<HTMLButtonElement>('#fill-current-page')
const fillResultElement = document.querySelector<HTMLElement>('#fill-result')
const fillReportElement = document.querySelector<HTMLElement>('#fill-report')
const copyPageStructureButton = document.querySelector<HTMLButtonElement>('#copy-page-structure')
const rememberPageButton = document.querySelector<HTMLButtonElement>('#remember-page')
const clearMemoryButton = document.querySelector<HTMLButtonElement>('#clear-memory')
const memoryResultElement = document.querySelector<HTMLElement>('#memory-result')
const memoryListElement = document.querySelector<HTMLElement>('#memory-list')

const workbenchOrigin = 'https://offerscoming.cn'

// A long form becomes a few dozen small requests. This is a backstop against a
// runaway page, not a target: the batch builder keeps real forms well under it.
const MAX_FILL_BATCHES = 60

/** Attempts per batch. A batch that still fails is skipped; the rest carry on. */
const FILL_BATCH_ATTEMPTS = 3
/**
 * How long to wait before re-sending a batch that failed.
 *
 * A dropped connection clears in a second or two. A rate limit does not: the
 * allowance reopens on a per-minute clock, so retrying after one second is not
 * only certain to fail, it is one more request against the very limit that is
 * being hit — which is how a single 429 becomes a run of them. The two waits
 * were the same before, and the short one was applied to the case that needs the
 * long one.
 */
const FILL_RETRY_DELAYS_MS = [1_000, 3_000]
const FILL_RATE_LIMIT_DELAYS_MS = [15_000, 30_000]

/** How long to wait before attempt `attempt + 1` of a failed batch. */
function retryDelayFor(error: unknown, attempt: number) {
  const delays = error instanceof ApiError && error.code === 'AI_PROVIDER_RATE_LIMITED'
    ? FILL_RATE_LIMIT_DELAYS_MS
    : FILL_RETRY_DELAYS_MS
  return delays[attempt]
}

/**
 * Breathes between batches so a fast form does not trip a requests-per-minute
 * cap. Twenty back-to-back calls is what turned a working fill into a mid-form
 * HTTP 429 in the first place.
 */
const FILL_BATCH_PACING_MS = 400
/**
 * How long one workbench request may take before it is abandoned.
 *
 * The workbench itself gives up on the model after 60 seconds and answers with its
 * own error, which says far more than a client-side timeout can. This has to sit
 * comfortably *above* that ceiling plus the workbench's own database work, or it
 * fires on requests that were about to succeed — a 75-second limit was close
 * enough to 60 to abort perfectly healthy answers.
 */
const API_TIMEOUT_MS = 100_000
/**
 * The whole fill is bounded, not just each request.
 *
 * Three attempts at 100 seconds is already 303 seconds for one batch, and a form
 * can hold a dozen batches: unbounded, a bad provider session means the popup sits
 * there for half an hour. What has been written and verified stays written, so
 * stopping at the budget costs the applicant the remainder of the form and nothing
 * else.
 */
const FILL_TOTAL_BUDGET_MS = 8 * 60_000
/** Below this much remaining budget, starting another batch is not worth it. */
const FILL_MIN_BATCH_BUDGET_MS = 10_000
/**
 * How long a streamed fill may go quiet before it is treated as dead.
 *
 * A stream is judged by silence rather than by total time: a whole form can
 * legitimately take minutes to write, but a connection with nothing on it for
 * three quarters of a minute is not about to produce an answer.
 */
const STREAM_IDLE_TIMEOUT_MS = 45_000
/**
 * How many streamed answers are gathered before the page is written to.
 *
 * One injection per answer would spend more time talking to the page than the fill
 * takes, and waiting for all of them would throw away the point of streaming.
 */
const STREAM_FLUSH_FIELDS = 8
const STREAM_FLUSH_MS = 700

type CaptureResult = {
  companyName?: string
  jobTitle?: string
  location?: string
  salaryMin?: number
  salaryMax?: number
  description?: string
}

type ApiSuccess<T> = {
  data: T
}

type ApiFailure = {
  error?: {
    code?: string
    message?: string
    details?: Array<{
      path?: Array<string | number>
      message?: string
    }>
  }
}

/**
 * Carries the response's status and machine-readable code alongside the message
 * the user sees. Without them a caller cannot tell a rate limit — which clears
 * on its own — from a rejected API key, which never will.
 */
class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Codes where a second attempt can plausibly succeed. */
const RETRYABLE_CODES = new Set([
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
const ABORTING_CODES = new Set([
  'AI_KEY_INVALID',
  'AI_KEY_NOT_CONFIGURED',
  'UNAUTHORIZED',
  'EMAIL_NOT_VERIFIED',
])

function isRetryable(error: unknown) {
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
function isGlobalFailure(error: unknown) {
  if (!(error instanceof ApiError)) return false
  return ABORTING_CODES.has(error.code) || error.status === 401 || error.status === 403
}

const pause = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

type SavedApplication = {
  id: string
}

type OpenQuestionAnswer = {
  answer: string
  provider: string
  model: string
}

type ApplicationProfile = {
  id: string
  name: string
  targetTags: string[]
  basics: {
    fullName?: string
    phone?: string
    email?: string
    city?: string
    countryRegion?: string
    gender?: string
    birthDate?: string
    wechatId?: string
    politicalStatus?: string
    documentType?: string
  }
}

type LocalFacts = { basics: Record<string, string | number | string[] | undefined>, educations: unknown[], strategy: Record<string, unknown>, resumeVersion: { id: string, type: string } | null }
type FillContext = { profileName: string, localFacts: LocalFacts, aiContext: unknown }

type FormFieldDescriptor = {
  id: string
  label?: string
  context?: string
  name?: string
  placeholder?: string
  inputType?: string
  controlType?: string
  options?: string[]
  multiple?: boolean
  hasValue?: boolean
  isEditable?: boolean
  /**
   * Which component of a split date this control holds, and which end of the
   * range the block around it names. Both are read on the page, where the DOM is,
   * and are consumed by the local rule table only — they are never sent to the
   * workbench, whose request schema rejects unknown keys.
   */
  dateUnit?: string
  dateRole?: string
}

type FillEntry = {
  fieldId: string
  label: string
  category: string
  status: 'filled' | 'skipped_existing' | 'skipped_sensitive' | 'needs_manual'
  reason: string
  target?: string
  record?: number
  value?: string
  /**
   * Set by the plan for the fields a model could only invent an answer for — a
   * control that names nothing, a repeating block with no saved record behind it,
   * a date component with no block to belong to.
   */
  skipAi?: boolean
}

type FillPlan = { entries: FillEntry[], summary: Record<FillEntry['status'], number> }

type AiFillPreview = {
  fills: Array<{ fieldId: string, value: string }>
  unresolvedIds: string[]
  provider: string
  model: string
}

let applicationProfiles: ApplicationProfile[] = []

let savedApplicationId: string | null = null

// The question thread is kept per profile, in extension storage rather than in
// memory: opening this popup covers the page it is filling, so any click back
// on that page closes it and would otherwise drop the conversation.
const OPEN_QUESTION_STORE_KEY = 'openQuestionThreads'
let openQuestionThreads: Record<string, Array<{ role: 'user' | 'assistant', content: string }>> = {}
let openQuestionProfileId = ''
let openQuestionPending = false

const QUESTION_PRESETS = [
  '请简述你的职业规划',
  '为什么选择我们公司',
  '你的优点和缺点是什么',
  '描述一次你克服困难的经历',
  '你最大的成就是什么',
]

// Answers the applicant has already given, for the questions the profile cannot
// answer. Kept in extension storage for the same reason the question thread is:
// the popup is destroyed whenever she goes back to the page.
const ANSWER_MEMORY_KEY = 'answerMemory'
let answerMemory: unknown = readMemory(null)

/** The fill-context of the profile last used, so the rules can be replayed. */
let lastFillContext: FillContext | null = null

/**
 * One field's identity, for deciding whether a control that now holds a value is
 * the same control a plan wrote to. Deliberately not the id: ids are positions,
 * and a page that re-renders between the scan and the write moves them.
 */
function fieldSignature(field: FormFieldDescriptor) {
  return [field.label, field.name, field.placeholder, field.controlType]
    .map(value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()).join('|')
}

/** Why a locally-filled field holds what it holds. */
function localFillReason(source: 'profile' | 'memory' | undefined) {
  return source === 'memory' ? '来自你记住的答案。' : '已由本地个人主档案填写。'
}

function setResult(element: HTMLElement | null, message: string, isError = false) {
  if (!element) return
  element.textContent = message
  element.classList.toggle('error', isError)
}

function setLoading(button: HTMLButtonElement | null, isLoading: boolean, loadingLabel: string) {
  if (!button) return
  if (isLoading) {
    button.dataset.label = button.textContent ?? ''
    button.textContent = loadingLabel
  }
  else if (button.dataset.label) {
    button.textContent = button.dataset.label
    delete button.dataset.label
  }
  button.disabled = isLoading
}

function clearSavedApplication() {
  savedApplicationId = null
}

function getHttpUrl(value: string | undefined) {
  if (!value) return undefined

  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
  }
  catch {
    return undefined
  }
}

function getOptionalSalary(input: HTMLInputElement | null) {
  const value = Number(input?.value)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function applyCapturedFields(fields: CaptureResult, url: string | undefined) {
  if (companyNameInput && fields.companyName) companyNameInput.value = fields.companyName
  if (jobTitleInput && fields.jobTitle) jobTitleInput.value = fields.jobTitle
  if (locationInput && fields.location) locationInput.value = fields.location
  if (salaryMinInput) salaryMinInput.value = fields.salaryMin?.toString() ?? ''
  if (salaryMaxInput) salaryMaxInput.value = fields.salaryMax?.toString() ?? ''
  const jobUrl = getHttpUrl(url)
  if (jobUrlInput && jobUrl) jobUrlInput.value = jobUrl
  if (descriptionInput) descriptionInput.value = fields.description ?? ''
}

function readJobPageDetails(): CaptureResult {
  const excludedTags = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON', 'SCRIPT', 'STYLE', 'NOSCRIPT'])
  const excludedSelector = Array.from(excludedTags).join(',')
  const maxPageTextLength = 60_000
  const isVisible = (element: Element) => {
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
  }
  const isReadableTextNode = (node: Node) => {
    const parent = node.parentElement
    return Boolean(parent && !parent.closest(excludedSelector) && isVisible(parent))
  }
  const textNodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isReadableTextNode(node) && node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    },
  })

  const lines: string[] = []
  let node: Node | null
  while ((node = textNodes.nextNode())) {
    const value = node.textContent?.replace(/\s+/g, ' ').trim()
    if (value && lines.at(-1) !== value) lines.push(value)
    if (lines.join('\n').length >= maxPageTextLength) break
  }

  const pageText = lines.join('\n')
  const findLastAnchorEnd = (expression: RegExp) => {
    let match: RegExpExecArray | null
    let end = -1
    while ((match = expression.exec(pageText))) end = match.index + match[0].length
    return end
  }
  const detailStart = findLastAnchorEnd(/职\s*位\s*描\s*述/g)
  const detailText = detailStart >= 0 ? pageText.slice(detailStart) : ''
  const recruiterStatusBoundary = /(?:^|\n)\s*(?:[^\n]{2,80}\n\s*)?(?:在线|刚\s*刚\s*活\s*跃|今\s*日\s*活\s*跃|(?:\d+|[一二三四五六七八九十两]+)\s*(?:分\s*钟|小\s*时|天)前\s*活\s*跃)\s*(?=\n|$)/i
  const recruiterStatusEnd = detailText.search(recruiterStatusBoundary)
  const contentSectionEnd = detailText.search(/(?:[^\n]{1,80}\s*[·•]\s*(?:HR|招\s*聘\s*者)|去\s*App|前\s*往\s*App|与\s*BOSS\s*随\s*时\s*沟\s*通|工\s*作\s*地\s*址|查\s*看\s*更\s*多\s*信\s*息|求\s*职\s*工\s*具|热\s*门\s*职\s*位|热\s*门\s*城\s*市|企\s*业\s*服\s*务|版\s*权)/i)
  const sectionEnd = [recruiterStatusEnd, contentSectionEnd].filter(value => value >= 0).sort((left, right) => left - right)[0] ?? -1
  const normalizeDescription = (value: string) => value
    .replace(/^\s*[:：]?\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。；：、！？）】》])/g, '$1')
    .replace(/([（【《])\s+/g, '$1')
    .replace(/([\u4E00-\u9FFF])\s+(?=[\u4E00-\u9FFF，。；：、！？）】》])/g, '$1')
    .replace(/([，。；：、！？])\s+(?=[\u4E00-\u9FFF])/g, '$1')
    .replace(/([：])\s+(?=\d)/g, '$1')
    .trim()
  const description = normalizeDescription(sectionEnd >= 0 ? detailText.slice(0, sectionEnd) : detailText)
    .slice(0, 20_000)

  const directText = (selectors: string[]) => {
    for (const selector of selectors) {
      const element = Array.from(document.querySelectorAll(selector))
        .find(candidate => !candidate.closest(excludedSelector) && isVisible(candidate))
      const value = element?.textContent?.replace(/\s+/g, ' ').trim()
      if (value && value.length <= 120) return value
    }
  }
  const detailPrefix = detailStart >= 0 ? pageText.slice(Math.max(0, detailStart - 2_500), detailStart) : ''
  const headerLines = detailPrefix.split('\n').map(value => value.trim()).filter(Boolean)
  const saveIndex = headerLines.lastIndexOf('收藏')
  const headerBeforeSave = saveIndex >= 0 ? headerLines.slice(0, saveIndex) : []
  const salaryIndex = headerBeforeSave.findLastIndex(value => /(?:\d|[\uE000-\uF8FF]).*(?:K|薪)|面议/i.test(value))
  const titleFromHeader = salaryIndex > 0 ? headerBeforeSave[salaryIndex - 1] : undefined
  const salaryText = directText([
    '[class*="job-detail"] [class*="salary"]',
    '[class*="job-primary"] [class*="salary"]',
  ]) ?? (salaryIndex >= 0 ? headerBeforeSave[salaryIndex] : undefined)
  const recruiterMatches = Array.from(pageText.matchAll(/(?:^|\n)\s*([^\n]{2,80}?)\s*[·•]\s*(?:招聘者|HR)\b/g))
  const companyFromRecruiter = recruiterMatches.at(-1)?.[1]?.trim()
  const recruiterProfileMatches = Array.from(detailText.matchAll(/(?:在线|刚\s*刚\s*活\s*跃|今\s*日\s*活\s*跃|(?:\d+|[一二三四五六七八九十两]+)\s*(?:分\s*钟|小\s*时|天)前\s*活\s*跃)\s*\n\s*([^\n·]{2,80}?)\s*[·•]\s*[^\n]{2,120}/g))
  const companyFromRecruiterProfile = recruiterProfileMatches[0]?.[1]?.trim()
  const addressMatch = detailText.match(/工\s*作\s*地\s*址\s*\n?\s*([^\n]{2,120})/)
  const salaryMatch = salaryText?.match(/(\d{1,3}(?:\.\d+)?)\s*(?:-|~|～|至|—)\s*(\d{1,3}(?:\.\d+)?)\s*[kK](?:\s*(?:·|\/|每)?\s*(?:月|薪))?/) ?? salaryText?.match(/(\d{1,3}(?:\.\d+)?)\s*[kK](?:\s*(?:·|\/|每)?\s*(?:月|薪))?/)
  const salaryMin = salaryMatch?.[1] ? Math.round(Number(salaryMatch[1]) * 1_000) : undefined
  const salaryMax = salaryMatch?.[2] ? Math.round(Number(salaryMatch[2]) * 1_000) : undefined

  return {
    jobTitle: directText([
      '[class*="job-detail"] h1',
      '[class*="job-detail"] [class*="job-title"]',
      '[class*="job-primary"] h1',
    ]) ?? titleFromHeader,
    companyName: companyFromRecruiterProfile ?? directText([
      '[class*="job-detail"] [class*="company-name"]',
      '[class*="company-info"] [class*="company-name"]',
    ]) ?? companyFromRecruiter,
    location: directText([
      '[class*="job-detail"] [class*="job-area"]',
      '[class*="job-detail"] [class*="location"]',
    ]) ?? addressMatch?.[1]?.trim(),
    salaryMin,
    salaryMax,
    description: description.length >= 40 ? description : undefined,
  }
}

/**
 * One workbench request, with a deadline of its own.
 *
 * `timeoutMs` is separate from the default so a caller working against a total
 * budget can shorten it and never overrun the budget by a whole request.
 */
async function readApi<T>(path: string, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = API_TIMEOUT_MS, ...requestInit } = init ?? {}
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(`${workbenchOrigin}${path}`, {
      headers: { 'content-type': 'application/json', ...(requestInit.headers ?? {}) },
      ...requestInit,
      signal: controller.signal,
    })
  }
  catch {
    // A dropped connection never produced a status, so it is named here rather
    // than surfacing as the browser's own "Failed to fetch". A request that was
    // aborted is ours, and saying which it was is what lets the report tell
    // “workbench is down” from “workbench is thinking too long”.
    throw controller.signal.aborted
      ? new ApiError(`工作台在 ${Math.round(timeoutMs / 1_000)} 秒内没有响应，本次没有改动页面。`, 0, 'NETWORK_TIMEOUT')
      : new ApiError('无法连接工作台，请确认 https://offerscoming.cn 可正常访问。', 0, 'NETWORK_UNREACHABLE')
  }
  finally {
    window.clearTimeout(timer)
  }
  const body = await response.json().catch(() => ({})) as ApiSuccess<T> & ApiFailure
  if (!response.ok || !('data' in body)) {
    // The auth middleware answers 401/403 with Nitro's own error shape rather
    // than this app's envelope, so `body.error` is empty and the applicant would
    // otherwise be shown “工作台请求失败（HTTP 401）” with nothing to act on.
    if (response.status === 401) {
      throw new ApiError('工作台登录已过期，请先打开 https://offerscoming.cn 重新登录。', 401, 'UNAUTHORIZED')
    }
    if (response.status === 403) {
      throw new ApiError('工作台账号未完成邮箱验证，请先在工作台验证邮箱。', 403, 'EMAIL_NOT_VERIFIED')
    }
    const detail = body.error?.details?.[0]
    const detailPath = detail?.path?.length ? `${detail.path.join('.')}：` : ''
    const detailMessage = detail?.message ? `${detailPath}${detail.message}` : ''
    const message = body.error?.message ?? `工作台请求失败（HTTP ${response.status}）。`
    throw new ApiError(detailMessage ? `${message} ${detailMessage}` : message, response.status, body.error?.code ?? '')
  }
  return body.data
}

/**
 * The field payload both fill endpoints accept.
 *
 * One mapping, because the server schema is strict: a key sent here that it does
 * not know is a 400 for the whole request, which is how a `dateUnit` nearly cost
 * every remaining field of a form once already.
 */
function fillRequestFields(fields: FormFieldDescriptor[]) {
  return fields.map(field => ({
    id: field.id,
    label: field.label,
    context: field.context,
    name: field.name,
    placeholder: field.placeholder,
    inputType: field.inputType,
    controlType: field.controlType,
    options: field.options,
    multiple: field.multiple,
  }))
}

/**
 * One batch of fields, retried on the failures that can clear on their own.
 *
 * `onRetry` reports progress so a long wait does not look like a hang, and it is
 * handed the error: “连接不稳定” was printed for a rate limit, a truncated model
 * reply and a dropped connection alike, which told the applicant nothing and made
 * the cause unguessable afterwards.
 *
 * A non-retryable error escapes on the first attempt: a rejected key or a
 * malformed request fails identically however many times it is sent.
 */
async function requestFillPreview(
  profileId: string,
  batch: FormFieldDescriptor[],
  onRetry: (attempt: number, error: unknown) => void,
  /** Milliseconds left in the fill's own budget, consulted before each attempt. */
  remainingMs: () => number,
) {
  let lastError: unknown
  for (let attempt = 0; attempt < FILL_BATCH_ATTEMPTS; attempt += 1) {
    try {
      return await readApi<AiFillPreview>('/api/v1/form-fill/preview', {
        method: 'POST',
        // A single attempt must never run past the fill's deadline, so the longer
        // of the two limits is never the one that decides.
        timeoutMs: Math.max(FILL_MIN_BATCH_BUDGET_MS, Math.min(API_TIMEOUT_MS, remainingMs())),
        body: JSON.stringify({ profileId, fields: fillRequestFields(batch) }),
      })
    }
    catch (error) {
      lastError = error
      const delay = retryDelayFor(error, attempt)
      // No point sleeping out a backoff the budget cannot pay for.
      if (delay === undefined || !isRetryable(error) || remainingMs() <= delay) break
      onRetry(attempt + 1, error)
      await pause(delay)
    }
  }
  throw lastError
}

type StreamOutcome = {
  /** Whether the endpoint answered with a stream at all. */
  handled: boolean
  provider: string
  model: string
  /** How many answers it handed over. */
  fills: number
  error: string
  warning: string
}

/**
 * One streamed request for the whole form.
 *
 * The response is newline-delimited JSON, one event per line: a `fill` as each
 * answer is written, then a `warning` or `error` if something went wrong, then
 * `done`. Answers are handed to `onFills` in small groups, so the page is written
 * to while the model is still working rather than after it stops.
 *
 * Nothing is thrown. A response that never produces an event comes back as
 * `handled: false` so the caller can fall back to the batch path: a stream that
 * arrives all at once is a property of the network in front of the workbench, not
 * of the answers, and it should cost a slower fill rather than a failed one.
 */
async function requestFillStream(
  profileId: string,
  fields: FormFieldDescriptor[],
  onFills: (fills: Array<{ fieldId: string, value: string }>) => Promise<void>,
  remainingMs: () => number,
): Promise<StreamOutcome> {
  const outcome: StreamOutcome = { handled: false, provider: '', model: '', fills: 0, error: '', warning: '' }
  const controller = new AbortController()
  let idleTimer = window.setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS)
  const keepAlive = () => {
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS)
  }

  try {
    const response = await fetch(`${workbenchOrigin}/api/v1/form-fill/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileId, fields: fillRequestFields(fields) }),
      signal: controller.signal,
    })
    const reader = response.body?.getReader()
    // A JSON error body, or a proxy that swallowed the body entirely: either way
    // there is nothing to read, and the batch path says more about why.
    if (!response.ok || !reader) return outcome

    const decoder = new TextDecoder()
    let buffer = ''
    const pending: Array<{ fieldId: string, value: string }> = []
    let lastFlush = Date.now()
    const flush = async (force: boolean) => {
      if (!pending.length) return
      if (!force && pending.length < STREAM_FLUSH_FIELDS && Date.now() - lastFlush < STREAM_FLUSH_MS) return
      const slice = pending.splice(0, pending.length)
      lastFlush = Date.now()
      await onFills(slice)
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      keepAlive()
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        let event: { type?: string, fieldId?: unknown, value?: unknown, message?: unknown, provider?: unknown, model?: unknown }
        try {
          event = JSON.parse(line)
        }
        catch {
          continue
        }
        outcome.handled = true
        if (event.type === 'fill' && typeof event.fieldId === 'string' && typeof event.value === 'string') {
          pending.push({ fieldId: event.fieldId, value: event.value })
          outcome.fills += 1
        }
        else if (event.type === 'warning') outcome.warning = String(event.message ?? '')
        else if (event.type === 'error') outcome.error = String(event.message ?? '')
        else if (event.type === 'done') {
          outcome.provider = String(event.provider ?? outcome.provider)
          outcome.model = String(event.model ?? outcome.model)
        }
      }
      await flush(false)
    }
    await flush(true)
    // One whole request for the form, so the budget is spent once rather than per
    // batch. Reported rather than thrown: the answers already written stay written.
    if (remainingMs() <= 0 && !outcome.error) outcome.error = '本次填写已用满时间预算。'
    return outcome
  }
  catch {
    // The connection dropped or went quiet. What arrived is already on the page.
    if (outcome.handled) outcome.error = outcome.error || 'AI 流式连接中断，已写入的字段保留在页面上。'
    return outcome
  }
  finally {
    window.clearTimeout(idleTimer)
  }
}

async function checkWorkbench() {
  if (!statusElement) return

  try {
    await readApi('/api/v1/applications?page=1&pageSize=1')
    statusElement.textContent = '工作台已连接'
    statusElement.dataset.state = 'connected'
  }
  catch {
    statusElement.textContent = '未连接工作台，请确认 https://offerscoming.cn 可正常访问。'
    statusElement.dataset.state = 'disconnected'
  }
}

function renderProfileOptions() {
  if (!applicationProfileSelect) return
  const previous = applicationProfileSelect.value
  applicationProfileSelect.replaceChildren(new Option('请选择一份网申档案', ''))
  for (const profile of applicationProfiles) {
    const suffix = profile.targetTags?.length ? `（${profile.targetTags.join(' / ')}）` : ''
    applicationProfileSelect.add(new Option(`${profile.name}${suffix}`, profile.id))
  }
  applicationProfileSelect.disabled = applicationProfiles.length === 0
  if (applicationProfiles.some(profile => profile.id === previous)) applicationProfileSelect.value = previous
  else if (applicationProfiles.length === 1) applicationProfileSelect.value = applicationProfiles[0].id
  if (fillCurrentPageButton) fillCurrentPageButton.disabled = applicationProfiles.length === 0
  // The question thread is per profile, so it follows this selection.
  showThreadForSelectedProfile()
}

async function loadApplicationProfiles() {
  setLoading(refreshProfilesButton, true, '刷新中…')
  try {
    applicationProfiles = await readApi<ApplicationProfile[]>('/api/v1/application-profiles')
    renderProfileOptions()
    setResult(fillResultElement, applicationProfiles.length
      ? '请选择一份网申档案，AI 会使用其中已保存的完整资料填写空白字段。'
      : '尚无网申档案，请先在工作台“网申档案”中创建。', applicationProfiles.length === 0)
  }
  catch (error) {
    applicationProfiles = []
    renderProfileOptions()
    const message = error instanceof Error ? error.message : '资料档案读取失败。'
    setResult(fillResultElement, message, true)
  }
  finally {
    setLoading(refreshProfilesButton, false, '')
  }
}

function renderFillReport(report: Omit<FillPlan, 'entries'> & { entries: Array<Omit<FillEntry, 'value'>> }) {
  if (!fillReportElement) return
  fillReportElement.replaceChildren()
  const labels: Record<FillEntry['status'], string> = {
    filled: '已填写',
    skipped_existing: '已有内容，已跳过',
    skipped_sensitive: '敏感字段，已跳过',
    needs_manual: '需手动处理',
  }
  const summary = document.createElement('p')
  summary.className = 'fill-summary'
  summary.textContent = `已填写 ${report.summary.filled} 项，已有内容跳过 ${report.summary.skipped_existing} 项，敏感字段跳过 ${report.summary.skipped_sensitive} 项，需手动处理 ${report.summary.needs_manual} 项。`
  fillReportElement.append(summary)

  for (const entry of report.entries) {
    const row = document.createElement('p')
    row.className = `fill-entry fill-entry-${entry.status}`
    row.textContent = `${labels[entry.status]}｜${entry.label}：${entry.reason}`
    fillReportElement.append(row)
  }
}

// Many ATS vendors render the whole application form inside an iframe, where a
// top-frame-only scan finds nothing at all. Every frame is scanned and written
// to on its own, with ids namespaced by the frame that owns them.
/**
 * How many frames this document embeds. Each injectable frame reports its own,
 * which is what makes “were any frames skipped?” answerable without guessing
 * from `contentDocument` (a frame stays cross-origin to the page even when the
 * extension holds a host permission for it).
 */
function countChildFrames() {
  return document.querySelectorAll('iframe, frame').length
}

/**
 * Scans every frame the extension may reach. Frame ids are namespaced so two
 * frames cannot collide on `form-field-3`, and the write goes back to the frame
 * the field came from.
 */
async function scanEveryFrame(tabId: number) {
  const [fieldResults, frameCounts] = await Promise.all([
    chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: scanVisibleFormFields }),
    chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: countChildFrames }),
  ])
  const declaredChildren = frameCounts.reduce((total, entry) => total + ((entry.result as number) ?? 0), 0)
  return {
    fields: fieldResults.flatMap(result => ((result.result ?? []) as FormFieldDescriptor[])
      .map(field => ({ ...field, id: qualifyFieldId(result.frameId, field.id) }))),
    unreachedFrames: countUnreachedFrames(fieldResults.length, declaredChildren),
  }
}

type FillOutcome = {
  appliedIds: string[]
  skippedExistingIds: string[]
  unavailableIds: string[]
  /** Why each unavailable id could not be written. Page-side writers fill this in. */
  unavailableReasons?: Record<string, string>
}

/**
 * Runs one page-side writer once per frame that owns an entry, and reports the
 * outcome against the same qualified ids the plan was built with. A frame that
 * fails on its own does not discard the frames that worked.
 */
async function applyEveryFrame(
  tabId: number,
  entries: Array<{ fieldId: string, value: string }>,
  unresolvedIds: string[],
  func: typeof applyFillEntries | typeof applyChoiceEntries,
): Promise<FillOutcome> {
  const perFrame = groupByFrame(entries, unresolvedIds)
  const outcome: FillOutcome = { appliedIds: [], skippedExistingIds: [], unavailableIds: [], unavailableReasons: {} }
  for (const [frameId, payload] of perFrame) {
    const qualify = (ids: string[]) => ids.map(id => qualifyFieldId(frameId, id))
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        func,
        args: [payload],
      })
      const value = result?.result as FillOutcome | undefined
      outcome.appliedIds.push(...qualify(value?.appliedIds ?? []))
      outcome.skippedExistingIds.push(...qualify(value?.skippedExistingIds ?? []))
      outcome.unavailableIds.push(...qualify(value?.unavailableIds ?? []))
      for (const [id, reason] of Object.entries(value?.unavailableReasons ?? {})) {
        outcome.unavailableReasons![qualifyFieldId(frameId, id)] = reason
      }
    }
    catch (error) {
      // A frame that cannot be injected at all — the form was re-mounted, a step
      // changed, the iframe went away — used to swallow its error and report every
      // one of its fields as “未能应用”, which is indistinguishable from a
      // matching failure. Now it is named, in the console and in the report.
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[form-fill] 帧注入失败', frameId, message)
      const ids = qualify([...payload.entries.map(entry => entry.fieldId), ...payload.unresolvedIds])
      for (const id of ids) {
        outcome.unavailableIds.push(id)
        outcome.unavailableReasons![id] = `这一帧注入失败（${message}），其中的字段本次没有填写。`
      }
    }
  }
  return outcome
}

/** The host of the page in the active tab, or `''` when it cannot be read. */
async function currentTabHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = getHttpUrl(tab?.url)
  if (!url) return ''
  try {
    return new URL(url).hostname
  }
  catch {
    return ''
  }
}

/**
 * Copies what the scanner sees on this page, so a site mapping can be written from
 * the page itself.
 *
 * The four vendors that cover most campus recruiting each render their forms their
 * own way, and a mapping invented from what those forms are *probably* like fills
 * the wrong box silently. One dump per vendor is what an honest mapping is written
 * from — and once a vendor is mapped, its fields are answered locally, without a
 * model call and without the guessing.
 */
async function copyPageStructure() {
  setLoading(copyPageStructureButton, true, '读取中…')
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('未找到当前页面，请先切到网申表单。')
    const { fields, unreachedFrames } = await scanEveryFrame(tab.id)
    const structure = {
      host: await currentTabHost(),
      url: getHttpUrl(tab.url) ?? '',
      profile: applicationProfileSelect?.value ? '已选' : '未选',
      unreachedFrames,
      fields: fields.map(field => ({
        id: field.id,
        label: field.label ?? '',
        name: field.name ?? '',
        placeholder: field.placeholder ?? '',
        controlType: field.controlType ?? '',
        inputType: field.inputType ?? '',
        options: (field.options ?? []).slice(0, 12),
        hasValue: field.hasValue === true,
        dateUnit: field.dateUnit ?? '',
        dateRole: field.dateRole ?? '',
        context: field.context ?? '',
      })),
    }
    await navigator.clipboard.writeText(JSON.stringify(structure, null, 2))
    setResult(fillResultElement, `已复制 ${structure.fields.length} 个控件的结构（带属性，不含已填的值）。把它粘给我，我就能按这家站点写映射。`)
  }
  catch (error) {
    setResult(fillResultElement, error instanceof Error ? error.message : '读取页面结构失败。', true)
  }
  finally {
    setLoading(copyPageStructureButton, false, '')
  }
}

async function loadAnswerMemory() {
  try {
    const stored = await chrome.storage.local.get(ANSWER_MEMORY_KEY)
    answerMemory = readMemory(stored?.[ANSWER_MEMORY_KEY])
  }
  catch {
    answerMemory = readMemory(null)
  }
  renderMemoryList()
}

async function persistAnswerMemory() {
  try {
    await chrome.storage.local.set({ [ANSWER_MEMORY_KEY]: answerMemory })
  }
  catch {
    // Storage is a convenience here; losing an answer must not block the fill.
  }
}

function renderMemoryList() {
  if (!memoryListElement) return
  memoryListElement.replaceChildren()
  const answers = listAnswers(answerMemory)
  if (clearMemoryButton) clearMemoryButton.disabled = answers.length === 0
  if (answers.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'memory-empty'
    empty.textContent = '还没有记住任何答案。'
    memoryListElement.append(empty)
    return
  }
  for (const answer of answers) {
    const row = document.createElement('div')
    row.className = 'memory-entry'
    const question = document.createElement('p')
    question.className = 'memory-question'
    question.textContent = answer.label || '（这个控件没有标签）'
    const value = document.createElement('p')
    value.className = 'memory-answer'
    value.textContent = answer.value
    const scope = document.createElement('p')
    scope.className = 'memory-scope'
    // “只在某站使用” and “通用” are the difference between an answer that means
    // something to one employer and a preference of her own; showing which one an
    // entry is stops a question that has to be re-answered from looking reusable.
    scope.textContent = answer.scope === 'host'
      ? `只在 ${answer.host || '这个站点'} 上使用`
      : `通用（用过 ${answer.uses} 次）`
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = '删除'
    remove.addEventListener('click', () => void forgetRememberedAnswer(answer.key))
    row.append(question, value, scope, remove)
    memoryListElement.append(row)
  }
}

async function forgetRememberedAnswer(key: string) {
  answerMemory = forgetAnswer(answerMemory, key)
  await persistAnswerMemory()
  renderMemoryList()
  setResult(memoryResultElement, '已删除这一条。')
}

async function clearRememberedAnswers() {
  answerMemory = clearMemory()
  await persistAnswerMemory()
  renderMemoryList()
  setResult(memoryResultElement, '已清空记住的答案。')
}

/**
 * The answers she has already given, resolved against a fresh scan of the page.
 *
 * Only the questions the profile could *not* answer are looked up: everything else
 * is filled from saved facts, and a remembered copy of it would only be a second,
 * staler source of truth.
 */
function planRememberedAnswers(entries: FillEntry[], fields: FormFieldDescriptor[], host: string) {
  const fieldById = new Map(fields.map(field => [field.id, field]))
  const fills: Array<{ fieldId: string, value: string }> = []
  const signatures = new Set<string>()
  for (const entry of entries) {
    if (entry.status !== 'needs_manual') continue
    const field = fieldById.get(entry.fieldId)
    if (!field) continue
    const hit = lookupAnswer(answerMemory, field, host)
    if (!hit) continue
    fills.push({ fieldId: entry.fieldId, value: hit.value })
    signatures.add(fieldSignature(field))
    answerMemory = touchAnswer(answerMemory, hit.key)
  }
  return { fills, signatures }
}

/**
 * Keeps what is on the page now, for the questions the profile cannot answer.
 *
 * This is the only place the extension reads a control's value, and it runs only
 * behind the applicant's click. What it keeps is decided by replaying the rules
 * against the same page with every value blanked: whatever the profile could have
 * supplied is left out, because the profile still supplies it on the next form.
 * Sensitive controls are left out on the same pass, so a document number is never
 * kept.
 */
async function rememberPageAnswers() {
  const selectedId = applicationProfileSelect?.value
  if (!selectedId) {
    setResult(memoryResultElement, '请先在上面选择一份网申档案。', true)
    return
  }
  setLoading(rememberPageButton, true, '读取中…')
  setResult(memoryResultElement, '')

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('未找到当前页面，请先切到填好的网申页。')

    const fillContext = lastFillContext
      ?? await readApi<FillContext>(`/api/v1/application-profiles/${encodeURIComponent(selectedId)}/fill-context`)
    lastFillContext = fillContext

    const [{ fields }, valueFrames] = await Promise.all([
      scanEveryFrame(tab.id),
      chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: collectControlValues }),
    ])
    const values = new Map<string, string>()
    for (const frame of valueFrames) {
      for (const [id, value] of Object.entries((frame.result ?? {}) as Record<string, string>)) {
        if (value) values.set(qualifyFieldId(frame.frameId, id), value)
      }
    }
    if (values.size === 0) throw new Error('这个页面上没有读到已填的内容。')

    const plan = buildFillPlan(fillContext.localFacts, fields.map(field => ({ ...field, hasValue: false }))) as FillPlan
    const fromProfile = new Set(plan.entries
      .filter(entry => entry.status === 'filled' || entry.status === 'skipped_sensitive')
      .map(entry => entry.fieldId))
    const fieldById = new Map(fields.map(field => [field.id, field]))
    const host = await currentTabHost()

    let kept = 0
    for (const [fieldId, value] of values) {
      if (fromProfile.has(fieldId)) continue
      const field = fieldById.get(fieldId)
      if (!field) continue
      answerMemory = rememberAnswer(answerMemory, field, value, { host })
      kept += 1
    }
    await persistAnswerMemory()
    renderMemoryList()
    setResult(memoryResultElement, kept
      ? `已记住 ${kept} 条答案（共 ${listAnswers(answerMemory).length} 条）。以后再遇到同样的问题会直接填，不再问 AI。`
      : '没有需要记住的新答案——这一页的内容都能从档案里推出来。')
  }
  catch (error) {
    setResult(memoryResultElement, error instanceof Error ? error.message : '读取页面内容失败。', true)
  }
  finally {
    setLoading(rememberPageButton, false, '')
  }
}

async function fillCurrentPage() {
  const selectedId = applicationProfileSelect?.value
  const profile = applicationProfiles.find(item => item.id === selectedId)
  if (!profile) {
    setResult(fillResultElement, '请先选择一份资料档案。', true)
    return
  }

  setLoading(fillCurrentPageButton, true, 'AI 正在填写…')
  setResult(fillResultElement, '')
  if (fillReportElement) fillReportElement.replaceChildren()

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('未找到当前页面，请切换到网申表单后重试。')
    // Held in a local: narrowing of `tab.id` does not survive into a callback that
    // runs later, and the streaming path writes to the page from exactly such a one.
    const tabId = tab.id

    const { fields, unreachedFrames } = await scanEveryFrame(tab.id)
    // Frames from an origin outside the vendor allowlist cannot be injected
    // into; naming the count beats reporting “no fields found”.
    const unreachedFrameWarning = unreachedFrames > 0
      ? `页面有 ${unreachedFrames} 个 iframe 未能访问，其中的表单没有填写。`
      : ''
    const fillContext = await readApi<FillContext>(`/api/v1/application-profiles/${encodeURIComponent(profile.id)}/fill-context`)
    lastFillContext = fillContext
    const localPlan = buildFillPlan(fillContext.localFacts, fields) as FillPlan
    const localEntries = localPlan.entries.filter(entry => entry.status === 'filled').map(entry => ({ fieldId: entry.fieldId, value: entry.value ?? '' }))
    // Answers she has already given come first, in the same pass as the saved
    // facts: both are written by the local writers and reconciled the same way, so
    // a remembered answer is never sent to a model that would only guess at it.
    const remembered = planRememberedAnswers(localPlan.entries, fields, await currentTabHost())
    const planned = [...localEntries, ...remembered.fills]
    const choiceEntries = planned.filter(entry => isChoiceField(entry.fieldId))
    const textEntries = planned.filter(entry => !isChoiceField(entry.fieldId))
    const [textOutcome, choiceOutcome] = await Promise.all([
      applyEveryFrame(tab.id, textEntries, [], applyFillEntries),
      applyEveryFrame(tab.id, choiceEntries, [], applyChoiceEntries),
    ])
    const localOutcome = {
      appliedIds: [...textOutcome.appliedIds, ...choiceOutcome.appliedIds],
      skippedExistingIds: [...textOutcome.skippedExistingIds, ...choiceOutcome.skippedExistingIds],
      unavailableIds: [...textOutcome.unavailableIds, ...choiceOutcome.unavailableIds],
    }
    if (remembered.fills.length) await persistAnswerMemory()
    const appliedSignatureCounts = localOutcome.appliedIds.reduce((counts, id) => {
      const field = fields.find(candidate => candidate.id === id)
      if (field) counts.set(fieldSignature(field), (counts.get(fieldSignature(field)) ?? 0) + 1)
      return counts
    }, new Map<string, number>())
    const { fields: activeFields } = await scanEveryFrame(tab.id)
    const activePlan = buildFillPlan(fillContext.localFacts, activeFields) as FillPlan
    const activeById = new Map(activePlan.entries.map(entry => [entry.fieldId, entry]))
    const activeLocalAppliedIds = new Set<string>()
    /** Whether a locally-filled control was answered from the profile or remembered. */
    const activeLocalSource = new Map<string, 'profile' | 'memory'>()
    for (const field of activeFields) {
      if (!field.hasValue) continue
      const signature = fieldSignature(field)
      const remaining = appliedSignatureCounts.get(signature) ?? 0
      if (remaining > 0) {
        activeLocalAppliedIds.add(field.id)
        activeLocalSource.set(field.id, remembered.signatures.has(signature) ? 'memory' : 'profile')
        appliedSignatureCounts.set(signature, remaining - 1)
      }
    }
    const aiFields = activeFields.filter((field) => {
      const entry = activeById.get(field.id)
      return !activeLocalAppliedIds.has(field.id)
        && entry?.category !== 'sensitive'
        // The plan knows when a control names nothing, or when a repeating page
        // block has no saved record behind it. Both are cases where a model can
        // only invent, so neither reaches it.
        && entry?.skipAi !== true
        && entry?.status !== 'skipped_existing'
        && !['checkbox'].includes(String(field.inputType ?? '').toLowerCase())
        && (String(field.inputType ?? '').toLowerCase() !== 'radio' || field.controlType === 'radio-group')
        && !['password', 'file'].includes(String(field.inputType ?? '').toLowerCase())
        && field.multiple !== true
    })
    if (aiFields.length === 0) {
      const entries = activePlan.entries.map((entry) => {
        const { value: _value, ...safeEntry } = entry
        return activeLocalAppliedIds.has(entry.fieldId)
          ? { ...safeEntry, status: 'filled' as const, reason: localFillReason(activeLocalSource.get(entry.fieldId)) }
          : safeEntry
      })
      const report = {
        entries,
        summary: entries.reduce((summary, entry) => {
          summary[entry.status] += 1
          return summary
        }, { filled: 0, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 }),
      }
      renderFillReport(report)
      setResult(fillResultElement, `${unreachedFrameWarning}当前页面没有可填写的空白字段。`, Boolean(unreachedFrameWarning))
      return
    }
    const appliedIds = new Set<string>()
    const unavailableIds = new Set<string>()
    /** Why a field could not be written, in the page's own words. */
    const unavailableReasons = new Map<string, string>()
    const aiFieldIds = new Set(aiFields.map(field => field.id))
    // The fields of a batch that never returned an answer. The fallback path only:
    // the streamed path has no batches to lose.
    const failedFieldIds = new Set<string>()
    // The fields of batches that were never sent, because the run stopped first.
    // They were not asked about, which is not the same as being declined.
    const notAttemptedFieldIds = new Set<string>()
    const startedAt = Date.now()
    const remainingMs = () => FILL_TOTAL_BUDGET_MS - (Date.now() - startedAt)
    let provider = ''
    let model = ''
    let failure = ''
    let stoppedEarly = ''
    let batchSummary = ''

    /**
     * Writes the answers a stream has handed over so far.
     *
     * Answers are applied in small groups as they arrive: waiting for the last one
     * would throw the point of streaming away, and one injection per answer would
     * spend more time talking to the page than the whole fill.
     */
    const flushFills = async (pending: Array<{ fieldId: string, value: string }>) => {
      if (!pending.length) return
      const [textOutcome, choiceOutcome] = await Promise.all([
        applyEveryFrame(tabId, pending.filter(fill => !isChoiceField(fill.fieldId)), [], applyFillEntries),
        applyEveryFrame(tabId, pending.filter(fill => isChoiceField(fill.fieldId)), [], applyChoiceEntries),
      ])
      for (const id of [...textOutcome.appliedIds, ...choiceOutcome.appliedIds]) appliedIds.add(id)
      for (const id of [...textOutcome.unavailableIds, ...choiceOutcome.unavailableIds]) unavailableIds.add(id)
      for (const outcome of [textOutcome, choiceOutcome]) {
        for (const [id, reason] of Object.entries(outcome.unavailableReasons ?? {})) unavailableReasons.set(id, reason)
      }
      setResult(fillResultElement, `AI 填写中：已填 ${appliedIds.size} / ${aiFields.length} 项…`)
    }

    // One streamed request for the whole form: the model sees every field at once
    // instead of a batch at a time, the answers land as they are written, and a form
    // that used to cost one provider call per batch costs one.
    const streamed = await requestFillStream(profile.id, aiFields, flushFills, remainingMs)
    if (streamed.handled) {
      provider = streamed.provider
      model = streamed.model
      failure = streamed.error
      if (streamed.warning) stoppedEarly = streamed.warning
    }
    else {
      // The stream produced no event at all — a proxy sitting on the response, a
      // deployment without this endpoint, or a request refused before any byte. The
      // batch path is slower and costs one call per batch, but it works, so it is
      // what this falls back to rather than failing the fill.
      // `buildFillBatches` is plain JavaScript, so its element type arrives as
      // `object`; naming it here is what keeps the rest of this function typed.
      const batches = buildFillBatches(
        aiFields.map(field => ({ fieldId: field.id, target: activeById.get(field.id)?.target, record: activeById.get(field.id)?.record })),
        aiFields,
      ) as FormFieldDescriptor[][]
      // A page that splits into an unreasonable number of batches is a page worth
      // stopping on rather than hammering the provider with hundreds of calls.
      if (batches.length > MAX_FILL_BATCHES) {
        throw new Error(`当前页面需要拆成 ${batches.length} 个批次，超过 ${MAX_FILL_BATCHES} 个上限。请分步骤填写或收起部分表单区块后重试；本次没有改动页面。`)
      }
      const stopBefore = (from: number) => {
        for (const remaining of batches.slice(from)) {
          for (const field of remaining) notAttemptedFieldIds.add(field.id)
        }
      }
      let completedBatches = 0
      // How many times in a row the same complaint has come back. One bad batch is
      // this batch's problem; three identical ones are the page's, and repeating it
      // just spends the budget saying the same thing.
      let sameFailureRuns = 0

      for (const [index, batch] of batches.entries()) {
        const batchLabel = `第 ${index + 1} / ${batches.length} 批`
        // Stop rather than start a batch the budget cannot pay for. What has been
        // written and verified stays written; the rest is reported as not asked.
        if (remainingMs() < FILL_MIN_BATCH_BUDGET_MS) {
          stoppedEarly = `本次填写已用满 ${Math.round(FILL_TOTAL_BUDGET_MS / 60_000)} 分钟预算`
          stopBefore(index)
          break
        }
        setResult(fillResultElement, `AI 填写中：${batchLabel}…`)
        // Space the requests out. A fast form is what trips a per-minute cap in
        // the first place, and pacing costs less than the retry it avoids.
        if (index > 0) await pause(FILL_BATCH_PACING_MS)
        try {
          const preview = await requestFillPreview(profile.id, batch, (attempt, retryError) => {
            // Name the failure. “连接不稳定” used to be printed for a rate limit, a
            // truncated model reply and a dropped connection alike, so the applicant
            // could not tell which she was hitting and neither could anyone reading
            // the message afterwards.
            const why = retryError instanceof Error ? retryError.message : '请求失败'
            setResult(fillResultElement, `AI 填写中：${batchLabel}…（第 ${attempt} 次重试：${why}）`)
          }, remainingMs)
          provider = preview.provider
          model = preview.model
          const choiceFills = preview.fills.filter(fill => isChoiceField(fill.fieldId))
          const textFills = preview.fills.filter(fill => !isChoiceField(fill.fieldId))
          const [textOutcome, choiceOutcome] = await Promise.all([
            applyEveryFrame(tab.id, textFills, preview.unresolvedIds.filter(id => !isChoiceField(id)), applyFillEntries),
            applyEveryFrame(tab.id, choiceFills, preview.unresolvedIds.filter(id => isChoiceField(id)), applyChoiceEntries),
          ])
          for (const id of [...textOutcome.appliedIds, ...choiceOutcome.appliedIds]) appliedIds.add(id)
          for (const id of [...textOutcome.unavailableIds, ...choiceOutcome.unavailableIds]) unavailableIds.add(id)
          for (const outcome of [textOutcome, choiceOutcome]) {
            for (const [id, reason] of Object.entries(outcome.unavailableReasons ?? {})) unavailableReasons.set(id, reason)
          }
          completedBatches += 1
        }
        catch (error) {
          // Everything already written and read back stays in place, and the
          // remaining batches still run: one rejected or timed-out batch no
          // longer costs the rest of the form.
          const message = error instanceof Error ? error.message : 'AI 填写请求失败。'
          sameFailureRuns = failure === message ? sameFailureRuns + 1 : 0
          failure = failure || message
          for (const field of batch) failedFieldIds.add(field.id)
          // A rejected key or an expired session fails identically for every batch,
          // so the rest are abandoned rather than re-sent one by one — but a
          // rejected *batch* (one malformed field descriptor) is this batch's
          // problem only, and used to cost the applicant the whole form.
          if (isGlobalFailure(error)) {
            stopBefore(index + 1)
            break
          }
          if (sameFailureRuns >= 2) {
            stoppedEarly = '连续的批次都以同样的原因失败'
            stopBefore(index + 1)
            break
          }
        }
      }
      batchSummary = batches.length > 1 ? `已完成 ${completedBatches}/${batches.length} 批。` : ''
    }

    const entries = activePlan.entries.map((entry) => {
      const { value: _value, ...safeEntry } = entry
      if (activeLocalAppliedIds.has(entry.fieldId)) return { ...safeEntry, status: 'filled' as const, reason: localFillReason(activeLocalSource.get(entry.fieldId)) }
      if (!aiFieldIds.has(entry.fieldId) || entry.status === 'skipped_existing' || entry.status === 'skipped_sensitive') return safeEntry
      if (appliedIds.has(entry.fieldId)) return { ...safeEntry, status: 'filled' as const, reason: `AI 已填写（${provider} / ${model}）。` }
      if (unavailableIds.has(entry.fieldId)) {
        const why = unavailableReasons.get(entry.fieldId)
        return {
          ...safeEntry,
          status: 'needs_manual' as const,
          reason: why ? `AI 已给出建议，但页面控件未能应用：${why}` : 'AI 已给出建议，但页面控件未能应用。',
        }
      }
      // A field whose batch never returned an answer keeps the plan's own reason
      // (“档案中没有该字段的可用内容” still tells the user what to do) and adds
      // why nothing was asked of it this round.
      if (failedFieldIds.has(entry.fieldId)) {
        const batchReason = String(entry.reason ?? '').trim().replace(/。$/, '')
        return {
          ...safeEntry,
          status: 'needs_manual' as const,
          reason: `${batchReason ? `${batchReason}；` : ''}其所在批次接口请求失败，本次未填写。`,
        }
      }
      // Not asked is not the same as declined: saying “AI 也未能给出答案” about a
      // field that was never sent makes the model look like it refused when it
      // was never given the chance.
      const localReason = String(entry.reason ?? '').trim()
      if (notAttemptedFieldIds.has(entry.fieldId)) {
        return {
          ...safeEntry,
          status: 'needs_manual' as const,
          reason: `${localReason ? `${localReason.replace(/。$/, '')}；` : ''}本次没有询问 AI（${stoppedEarly || '前面的批次失败后中止'}）。`,
        }
      }
      // Keep the plan's own reason alongside the AI outcome. “档案里没有语言能力
      // 那一段，AI 也答不出来” points at the profile; “AI 未给出可用答案” alone
      // suggests the tool failed when it actually declined to invent.
      return {
        ...safeEntry,
        status: 'needs_manual' as const,
        reason: localReason ? `${localReason.replace(/。$/, '')}；AI 也未能给出答案。` : 'AI 未给出可用答案。',
      }
    })
    const report = {
      entries,
      summary: entries.reduce((summary, entry) => {
        summary[entry.status] += 1
        return summary
      }, { filled: 0, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 }),
    }
    renderFillReport(report)

    const rememberedSummary = remembered.fills.length ? `其中 ${remembered.fills.length} 项来自你记住的答案。` : ''
    if (failure) {
      const failed = failedFieldIds.size ? `有 ${failedFieldIds.size} 项因接口失败未填写，已在下方标出。` : ''
      const skipped = notAttemptedFieldIds.size
        ? `另有 ${notAttemptedFieldIds.size} 项${stoppedEarly ? `（${stoppedEarly}）` : '因中止'}本次没有询问 AI，已在下方标出。`
        : ''
      const kept = report.summary.filled ? `已写入并校验的 ${report.summary.filled} 项保留在页面上，可直接使用或手动修改。` : ''
      setResult(fillResultElement, `${unreachedFrameWarning}${batchSummary}${rememberedSummary}${failure} ${failed}${skipped}${kept}`, true)
      return
    }
    const unfinished = notAttemptedFieldIds.size
      ? `${stoppedEarly}，剩余字段本次没有询问 AI。`
      // A streamed fill can end early with nothing left unasked — the reply hit the
      // output ceiling — and that still has to reach the applicant.
      : stoppedEarly
    setResult(
      fillResultElement,
      `${unreachedFrameWarning}${batchSummary}${rememberedSummary}${unfinished}AI 填写已完成：浅绿色为已填写，浅红色为未能填写。请在提交前检查。`,
      Boolean(unreachedFrameWarning) || Boolean(unfinished),
    )
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '页面字段识别或填写失败。'
    setResult(fillResultElement, `${message} 不会自动重试。`, true)
  }
  finally {
    setLoading(fillCurrentPageButton, false, '')
  }
}

async function captureCurrentPage() {
  setLoading(readPageButton, true, '读取中…')
  setResult(jobResultElement, '')
  clearSavedApplication()

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('未找到当前页面，请切换到岗位详情页后重试。')

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readJobPageDetails,
    })
    const capture = result?.result
    if (!capture?.description) throw new Error('未识别到岗位 JD，请手动粘贴岗位描述。')

    applyCapturedFields(capture, tab.url)
    setResult(jobResultElement, '已读取岗位详情。未能可靠识别的字段会留空，请检查并编辑后再保存。')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '读取失败，请手动填写岗位信息。'
    setResult(jobResultElement, `${message} 不会自动重试。`, true)
  }
  finally {
    setLoading(readPageButton, false, '')
  }
}

async function saveCurrentJob() {
  const companyName = companyNameInput?.value.trim() ?? ''
  const jobTitle = jobTitleInput?.value.trim() ?? ''
  const description = descriptionInput?.value.trim() ?? ''
  const salaryMin = getOptionalSalary(salaryMinInput)
  const salaryMax = getOptionalSalary(salaryMaxInput)

  if (!companyName || !jobTitle) {
    setResult(jobResultElement, '请填写公司和岗位名称后再保存。', true)
    return
  }
  if (salaryMin && salaryMax && salaryMin > salaryMax) {
    setResult(jobResultElement, '薪资下限不能高于上限。', true)
    return
  }

  setLoading(saveJobButton, true, '保存中…')
  setResult(jobResultElement, '')

  try {
    const jobUrl = getHttpUrl(jobUrlInput?.value.trim())
    const host = jobUrl ? new URL(jobUrl).hostname.toLowerCase() : ''
    const channel = host.includes('zhipin.com') ? 'BOSS' : host.includes('nowcoder.com') ? 'NIUKE' : 'OTHER'
    const application = await readApi<SavedApplication>('/api/v1/applications', {
      method: 'POST',
      body: JSON.stringify({
        companyName,
        jobTitle,
        location: locationInput?.value.trim() || undefined,
        salaryMin,
        salaryMax,
        jobUrl,
        description: description || undefined,
        source: channel === 'BOSS' ? 'BOSS' : channel === 'NIUKE' ? 'NIUKE' : 'MANUAL',
        status: 'SAVED',
        channel,
      }),
    })
    savedApplicationId = application.id
    setResult(jobResultElement, '已保存到工作台。现在可基于该岗位生成打招呼话术。')
    void checkWorkbench()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '保存失败，请检查工作台连接后重试。'
    setResult(jobResultElement, message, true)
  }
  finally {
    setLoading(saveJobButton, false, '')
  }
}

async function loadOpenQuestionThreads() {
  try {
    const stored = await chrome.storage.local.get(OPEN_QUESTION_STORE_KEY)
    const value = stored?.[OPEN_QUESTION_STORE_KEY]
    openQuestionThreads = value && typeof value === 'object' ? value : {}
  }
  catch {
    openQuestionThreads = {}
  }
  showThreadForSelectedProfile()
}

async function persistOpenQuestionThreads() {
  try {
    await chrome.storage.local.set({ [OPEN_QUESTION_STORE_KEY]: openQuestionThreads })
  }
  catch {
    // Storage is a convenience here; losing the thread must not block asking.
  }
}

function currentThread() {
  return readThread(openQuestionThreads, openQuestionProfileId)
}

/** The thread belongs to whichever profile is selected at the top of the popup. */
function showThreadForSelectedProfile() {
  openQuestionProfileId = applicationProfileSelect?.value ?? ''
  renderThread()
  if (askQuestionButton) askQuestionButton.disabled = !openQuestionProfileId || openQuestionPending
  if (clearThreadButton) clearThreadButton.disabled = !openQuestionProfileId || openQuestionPending || currentThread().length === 0
}

async function copyAnswer(text: string, button: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(text)
    const label = button.textContent
    button.textContent = '已复制'
    window.setTimeout(() => { button.textContent = label }, 1_500)
  }
  catch {
    setResult(qaResultElement, '复制失败，请手动选中答案复制。', true)
  }
}

function renderThread() {
  if (!qaThreadElement) return
  qaThreadElement.replaceChildren()
  const thread = currentThread()

  for (let index = 0; index < thread.length; index += 1) {
    const message = thread[index]
    if (message.role !== 'user') continue
    const turn = document.createElement('div')
    turn.className = 'qa-turn'
    const question = document.createElement('p')
    question.className = 'qa-question'
    question.textContent = message.content
    turn.append(question)

    const reply = thread[index + 1]
    if (reply?.role === 'assistant') {
      const body = document.createElement('p')
      body.className = 'qa-answer'
      body.textContent = reply.content
      const actions = document.createElement('div')
      actions.className = 'qa-actions'
      const copy = document.createElement('button')
      copy.type = 'button'
      copy.textContent = '复制回答'
      copy.addEventListener('click', () => void copyAnswer(reply.content, copy))
      const note = document.createElement('span')
      note.className = 'qa-note'
      note.textContent = 'AI 生成，提交前请核对'
      actions.append(copy, note)
      turn.append(body, actions)
    }
    else if (openQuestionPending) {
      const pending = document.createElement('p')
      pending.className = 'qa-pending'
      pending.textContent = '正在生成…'
      turn.append(pending)
    }

    qaThreadElement.append(turn)
  }
}

function renderQuestionPresets() {
  if (!qaPresetsElement) return
  qaPresetsElement.replaceChildren()
  for (const preset of QUESTION_PRESETS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = preset
    button.addEventListener('click', () => {
      if (qaQuestionInput) qaQuestionInput.value = preset
      qaQuestionInput?.focus()
    })
    qaPresetsElement.append(button)
  }
}

async function askQuestion() {
  const question = qaQuestionInput?.value.trim() ?? ''
  if (!openQuestionProfileId) {
    setResult(qaResultElement, '请先在上面选择一份网申档案。', true)
    return
  }
  if (!question) {
    setResult(qaResultElement, '请先输入你的问题。', true)
    return
  }

  const profileId = openQuestionProfileId
  const previous = currentThread()
  const asked = appendTurn(previous, question, '')
  openQuestionThreads = writeThread(openQuestionThreads, profileId, asked)
  openQuestionPending = true
  if (qaQuestionInput) qaQuestionInput.value = ''
  setResult(qaResultElement, '')
  setLoading(askQuestionButton, true, '生成中…')
  if (clearThreadButton) clearThreadButton.disabled = true
  renderThread()

  try {
    const reply = await readApi<OpenQuestionAnswer>('/api/v1/open-questions/answer', {
      method: 'POST',
      body: JSON.stringify({ profileId, messages: toRequestMessages(asked) }),
    })
    openQuestionThreads = writeThread(openQuestionThreads, profileId, [
      ...asked,
      { role: 'assistant', content: reply.answer },
    ])
    await persistOpenQuestionThreads()
    setResult(qaResultElement, `已生成（${reply.provider} / ${reply.model}）。答案由 AI 生成，提交前请核对。`)
  }
  catch (error) {
    // Roll the unanswered question back and hand it to the input box, so a
    // retry does not leave two questions in a row in the thread.
    openQuestionThreads = writeThread(openQuestionThreads, profileId, previous)
    await persistOpenQuestionThreads()
    if (qaQuestionInput) qaQuestionInput.value = question
    setResult(qaResultElement, error instanceof Error ? error.message : '生成失败，请稍后重试。', true)
  }
  finally {
    openQuestionPending = false
    setLoading(askQuestionButton, false, '')
    showThreadForSelectedProfile()
  }
}

async function clearThread() {
  if (!openQuestionProfileId) return
  openQuestionThreads = writeThread(openQuestionThreads, openQuestionProfileId, [])
  await persistOpenQuestionThreads()
  setResult(qaResultElement, '')
  showThreadForSelectedProfile()
}

for (const input of [companyNameInput, jobTitleInput, locationInput, salaryMinInput, salaryMaxInput, jobUrlInput, descriptionInput]) {
  input?.addEventListener('input', clearSavedApplication)
}

readPageButton?.addEventListener('click', () => void captureCurrentPage())
saveJobButton?.addEventListener('click', () => void saveCurrentJob())
refreshProfilesButton?.addEventListener('click', () => void loadApplicationProfiles())
fillCurrentPageButton?.addEventListener('click', () => void fillCurrentPage())
copyPageStructureButton?.addEventListener('click', () => void copyPageStructure())
rememberPageButton?.addEventListener('click', () => void rememberPageAnswers())
clearMemoryButton?.addEventListener('click', () => void clearRememberedAnswers())
applicationProfileSelect?.addEventListener('change', () => showThreadForSelectedProfile())
askQuestionButton?.addEventListener('click', () => void askQuestion())
clearThreadButton?.addEventListener('click', () => void clearThread())

void checkWorkbench()
void loadApplicationProfiles()
void loadOpenQuestionThreads()
void loadAnswerMemory()
void renderQuestionPresets()
