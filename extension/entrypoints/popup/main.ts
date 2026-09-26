import './style.css'
import { applyChoiceEntries, applyFillEntries, scanVisibleFormFields } from '../../lib/form-page-bridge.js'
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

const workbenchOrigin = 'https://offerscoming.cn'

// A long form becomes a few dozen small requests. This is a backstop against a
// runaway page, not a target: the batch builder keeps real forms well under it.
const MAX_FILL_BATCHES = 60

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
    message?: string
    details?: Array<{
      path?: Array<string | number>
      message?: string
    }>
  }
}

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

async function readApi<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${workbenchOrigin}${path}`, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  const body = await response.json().catch(() => ({})) as ApiSuccess<T> & ApiFailure
  if (!response.ok || !('data' in body)) {
    const detail = body.error?.details?.[0]
    const detailPath = detail?.path?.length ? `${detail.path.join('.')}：` : ''
    const detailMessage = detail?.message ? `${detailPath}${detail.message}` : ''
    const message = body.error?.message ?? `工作台请求失败（HTTP ${response.status}）。`
    throw new Error(detailMessage ? `${message} ${detailMessage}` : message)
  }
  return body.data
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

type FillOutcome = { appliedIds: string[], skippedExistingIds: string[], unavailableIds: string[] }

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
  const outcome: FillOutcome = { appliedIds: [], skippedExistingIds: [], unavailableIds: [] }
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
    }
    catch {
      outcome.unavailableIds.push(...qualify([...payload.entries.map(entry => entry.fieldId), ...payload.unresolvedIds]))
    }
  }
  return outcome
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

    const { fields, unreachedFrames } = await scanEveryFrame(tab.id)
    // Frames from an origin outside the vendor allowlist cannot be injected
    // into; naming the count beats reporting “no fields found”.
    const unreachedFrameWarning = unreachedFrames > 0
      ? `页面有 ${unreachedFrames} 个 iframe 未能访问，其中的表单没有填写。`
      : ''
    const fillContext = await readApi<FillContext>(`/api/v1/application-profiles/${encodeURIComponent(profile.id)}/fill-context`)
    const localPlan = buildFillPlan(fillContext.localFacts, fields) as FillPlan
    const localEntries = localPlan.entries.filter(entry => entry.status === 'filled').map(entry => ({ fieldId: entry.fieldId, value: entry.value ?? '' }))
    const choiceEntries = localEntries.filter(entry => isChoiceField(entry.fieldId))
    const textEntries = localEntries.filter(entry => !isChoiceField(entry.fieldId))
    const [textOutcome, choiceOutcome] = await Promise.all([
      applyEveryFrame(tab.id, textEntries, [], applyFillEntries),
      applyEveryFrame(tab.id, choiceEntries, [], applyChoiceEntries),
    ])
    const localOutcome = {
      appliedIds: [...textOutcome.appliedIds, ...choiceOutcome.appliedIds],
      skippedExistingIds: [...textOutcome.skippedExistingIds, ...choiceOutcome.skippedExistingIds],
      unavailableIds: [...textOutcome.unavailableIds, ...choiceOutcome.unavailableIds],
    }
    const fieldSignature = (field: FormFieldDescriptor) => [field.label, field.name, field.placeholder, field.controlType]
      .map(value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()).join('|')
    const appliedSignatureCounts = localOutcome.appliedIds.reduce((counts, id) => {
      const field = fields.find(candidate => candidate.id === id)
      if (field) counts.set(fieldSignature(field), (counts.get(fieldSignature(field)) ?? 0) + 1)
      return counts
    }, new Map<string, number>())
    const { fields: activeFields } = await scanEveryFrame(tab.id)
    const activePlan = buildFillPlan(fillContext.localFacts, activeFields) as FillPlan
    const activeById = new Map(activePlan.entries.map(entry => [entry.fieldId, entry]))
    const activeLocalAppliedIds = new Set<string>()
    for (const field of activeFields) {
      if (!field.hasValue) continue
      const signature = fieldSignature(field)
      const remaining = appliedSignatureCounts.get(signature) ?? 0
      if (remaining > 0) {
        activeLocalAppliedIds.add(field.id)
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
          ? { ...safeEntry, status: 'filled' as const, reason: '已由本地个人主档案填写。' }
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
    const batches = buildFillBatches(
      aiFields.map(field => ({ fieldId: field.id, target: activeById.get(field.id)?.target, record: activeById.get(field.id)?.record })),
      aiFields,
    )
    // A page that splits into an unreasonable number of batches is a page worth
    // stopping on rather than hammering the provider with hundreds of calls.
    if (batches.length > MAX_FILL_BATCHES) {
      throw new Error(`当前页面需要拆成 ${batches.length} 个批次，超过 ${MAX_FILL_BATCHES} 个上限。请分步骤填写或收起部分表单区块后重试；本次没有改动页面。`)
    }

    const appliedIds = new Set<string>()
    const unavailableIds = new Set<string>()
    const aiFieldIds = new Set(aiFields.map(field => field.id))
    let provider = ''
    let model = ''
    let completedBatches = 0
    let failure = ''

    for (const [index, batch] of batches.entries()) {
      setResult(fillResultElement, `AI 填写中：第 ${index + 1} / ${batches.length} 批…`)
      try {
        const preview = await readApi<AiFillPreview>('/api/v1/form-fill/preview', {
          method: 'POST',
          body: JSON.stringify({ profileId: profile.id, fields: batch.map(field => ({
            id: field.id,
            label: field.label,
            context: field.context,
            name: field.name,
            placeholder: field.placeholder,
            inputType: field.inputType,
            controlType: field.controlType,
            options: field.options,
            multiple: field.multiple,
          })) }),
        })
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
        completedBatches += 1
      }
      catch (error) {
        // Everything already written and read back stays in place; stopping here
        // keeps a broken provider from being called once per remaining batch.
        failure = error instanceof Error ? error.message : 'AI 填写请求失败。'
        break
      }
    }

    const entries = activePlan.entries.map((entry) => {
      const { value: _value, ...safeEntry } = entry
      if (activeLocalAppliedIds.has(entry.fieldId)) return { ...safeEntry, status: 'filled' as const, reason: '已由本地个人主档案填写。' }
      if (!aiFieldIds.has(entry.fieldId) || entry.status === 'skipped_existing' || entry.status === 'skipped_sensitive') return safeEntry
      if (appliedIds.has(entry.fieldId)) return { ...safeEntry, status: 'filled' as const, reason: `AI 已填写（${provider} / ${model}）。` }
      if (unavailableIds.has(entry.fieldId)) return { ...safeEntry, status: 'needs_manual' as const, reason: 'AI 已给出建议，但页面控件未能应用。' }
      // A batch that never ran keeps the plan's own reason: “档案中没有该字段的
      // 可用内容” tells the user what to do, where “AI 未执行” only repeats the
      // headline. The summary already reports the batch failure.
      if (failure && completedBatches < batches.length) return safeEntry
      // Keep the plan's own reason alongside the AI outcome. “档案里没有语言能力
      // 那一段，AI 也答不出来” points at the profile; “AI 未给出可用答案” alone
      // suggests the tool failed when it actually declined to invent.
      const localReason = String(entry.reason ?? '').trim()
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

    const batchSummary = batches.length > 1 ? `已完成 ${completedBatches}/${batches.length} 批。` : ''
    if (failure) {
      const kept = report.summary.filled ? `已写入并校验的 ${report.summary.filled} 项保留在页面上，可直接使用或手动修改。` : ''
      setResult(fillResultElement, `${unreachedFrameWarning}${batchSummary}${failure} ${kept}`, true)
      return
    }
    setResult(
      fillResultElement,
      `${unreachedFrameWarning}${batchSummary}AI 填写已完成：浅绿色为已填写，浅红色为未能填写。请在提交前检查。`,
      Boolean(unreachedFrameWarning),
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
applicationProfileSelect?.addEventListener('change', () => showThreadForSelectedProfile())
askQuestionButton?.addEventListener('click', () => void askQuestion())
clearThreadButton?.addEventListener('click', () => void clearThread())

void checkWorkbench()
void loadApplicationProfiles()
void loadOpenQuestionThreads()
void renderQuestionPresets()
