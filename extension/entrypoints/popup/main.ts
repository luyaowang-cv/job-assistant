import './style.css'
import { applyChoiceEntries, applyFillEntries, scanVisibleFormFields } from '../../lib/form-page-bridge.js'
import { buildFillPlan, reconcileFillOutcome } from '../../lib/form-fill-rules.js'

const statusElement = document.querySelector<HTMLElement>('#status')
const readPageButton = document.querySelector<HTMLButtonElement>('#read-page')
const saveJobButton = document.querySelector<HTMLButtonElement>('#save-job')
const generateGreetingButton = document.querySelector<HTMLButtonElement>('#generate-greeting')
const companyNameInput = document.querySelector<HTMLInputElement>('#company-name')
const jobTitleInput = document.querySelector<HTMLInputElement>('#job-title')
const locationInput = document.querySelector<HTMLInputElement>('#location')
const salaryMinInput = document.querySelector<HTMLInputElement>('#salary-min')
const salaryMaxInput = document.querySelector<HTMLInputElement>('#salary-max')
const jobUrlInput = document.querySelector<HTMLInputElement>('#job-url')
const descriptionInput = document.querySelector<HTMLTextAreaElement>('#description')
const resumeTextInput = document.querySelector<HTMLTextAreaElement>('#resume-text')
const jobResultElement = document.querySelector<HTMLElement>('#job-result')
const greetingResultElement = document.querySelector<HTMLElement>('#greeting-result')
const greetingsElement = document.querySelector<HTMLElement>('#greetings')
const applicationProfileSelect = document.querySelector<HTMLSelectElement>('#application-profile')
const refreshProfilesButton = document.querySelector<HTMLButtonElement>('#refresh-profiles')
const fillCurrentPageButton = document.querySelector<HTMLButtonElement>('#fill-current-page')
const fillResultElement = document.querySelector<HTMLElement>('#fill-result')
const fillReportElement = document.querySelector<HTMLElement>('#fill-report')

const workbenchOrigin = 'http://127.0.0.1:3000'

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
  }
}

type SavedApplication = {
  id: string
}

type Greeting = {
  text: string
  evidence: string
}

type MaterialsPreview = {
  aiDraft: {
    greetings: {
      short: Greeting
      standard: Greeting
      technicalHighlight: Greeting
    }
  }
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
  if (greetingsElement) greetingsElement.replaceChildren()
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
    throw new Error(body.error?.message ?? `工作台请求失败（HTTP ${response.status}）。`)
  }
  return body.data
}

async function checkWorkbench() {
  if (!statusElement) return

  try {
    await readApi('/api/v1/applications?page=1&pageSize=1')
    statusElement.textContent = '本地工作台已连接'
    statusElement.dataset.state = 'connected'
  }
  catch {
    statusElement.textContent = '未连接本地工作台，请确认 http://127.0.0.1:3000 正在运行。'
    statusElement.dataset.state = 'disconnected'
  }
}

function renderProfileOptions() {
  if (!applicationProfileSelect) return
  applicationProfileSelect.replaceChildren(new Option('请选择一份资料档案', ''))
  for (const profile of applicationProfiles) {
    const suffix = profile.targetTags?.length ? `（${profile.targetTags.join(' / ')}）` : ''
    applicationProfileSelect.add(new Option(`${profile.name}${suffix}`, profile.id))
  }
  applicationProfileSelect.disabled = applicationProfiles.length === 0
  if (fillCurrentPageButton) fillCurrentPageButton.disabled = applicationProfiles.length === 0
}

async function loadApplicationProfiles() {
  setLoading(refreshProfilesButton, true, '刷新中…')
  try {
    applicationProfiles = await readApi<ApplicationProfile[]>('/api/v1/application-profiles')
    renderProfileOptions()
    setResult(fillResultElement, applicationProfiles.length
      ? '请选择一份资料档案；默认只填写安全的空白字段。'
      : '尚无资料档案，请先在工作台“网申资料”中创建。', applicationProfiles.length === 0)
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

    const [scanResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanVisibleFormFields,
    })
    const fields = (scanResult?.result ?? []) as FormFieldDescriptor[]
    const fillContext = await readApi<FillContext>(`/api/v1/application-profiles/${encodeURIComponent(profile.id)}/fill-context`)
    const localPlan = buildFillPlan(fillContext.localFacts, fields) as FillPlan
    const byId = new Map(localPlan.entries.map(entry => [entry.fieldId, entry]))
    const localEntries = localPlan.entries.filter(entry => entry.status === 'filled').map(entry => ({ fieldId: entry.fieldId, value: entry.value ?? '' }))
    const choiceEntries = localEntries.filter(entry => /^radio-group-|^custom-select-/.test(entry.fieldId))
    const textEntries = localEntries.filter(entry => !/^radio-group-|^custom-select-/.test(entry.fieldId))
    const textOutcome = textEntries.length
      ? (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: applyFillEntries, args: [textEntries] }))[0]?.result ?? { appliedIds: [], skippedExistingIds: [], unavailableIds: textEntries.map(entry => entry.fieldId) }
      : { appliedIds: [], skippedExistingIds: [], unavailableIds: [] }
    const choiceOutcome = choiceEntries.length
      ? (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: applyChoiceEntries, args: [choiceEntries] }))[0]?.result ?? { appliedIds: [], skippedExistingIds: [], unavailableIds: choiceEntries.map(entry => entry.fieldId) }
      : { appliedIds: [], skippedExistingIds: [], unavailableIds: [] }
    const localOutcome = {
      appliedIds: [...textOutcome.appliedIds, ...choiceOutcome.appliedIds],
      skippedExistingIds: [...textOutcome.skippedExistingIds, ...choiceOutcome.skippedExistingIds],
      unavailableIds: [...textOutcome.unavailableIds, ...choiceOutcome.unavailableIds],
    }
    const localAppliedIds = new Set(localOutcome.appliedIds)
    const localUnavailableIds = new Set(localOutcome.unavailableIds)
    const localExistingIds = new Set(localOutcome.skippedExistingIds)
    const aiFields = fields.filter((field) => {
      const entry = byId.get(field.id)
      return !localAppliedIds.has(field.id)
        && entry?.category !== 'sensitive'
        && entry?.status !== 'skipped_existing'
        && field.isEditable !== false
        && field.controlType !== 'radio-group'
        && !['checkbox', 'radio'].includes(String(field.inputType ?? '').toLowerCase())
        && !['password', 'file'].includes(String(field.inputType ?? '').toLowerCase())
        && field.multiple !== true
    })
    if (aiFields.length === 0) {
      const report = reconcileFillOutcome(localPlan, localOutcome) as Omit<FillPlan, 'entries'> & { entries: Array<Omit<FillEntry, 'value'>> }
      renderFillReport(report)
      setResult(fillResultElement, '没有可交给 AI 的空白普通字段。', true)
      return
    }
    const preview = await readApi<AiFillPreview>('/api/v1/form-fill/preview', {
      method: 'POST',
      body: JSON.stringify({ profileId: profile.id, fields: aiFields.map(field => ({
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
    const aiChoiceFills = preview.fills.filter(fill => /^custom-select-/.test(fill.fieldId))
    const aiTextFills = preview.fills.filter(fill => !/^custom-select-/.test(fill.fieldId))
    const aiTextOutcome = aiTextFills.length === 0 && preview.unresolvedIds.length === 0
      ? { appliedIds: [], skippedExistingIds: [], unavailableIds: [] }
      : (await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: applyFillEntries,
          args: [{ entries: aiTextFills, unresolvedIds: preview.unresolvedIds.filter(id => !/^custom-select-/.test(id)) }],
        }))[0]?.result ?? { appliedIds: [], skippedExistingIds: [], unavailableIds: aiTextFills.map(entry => entry.fieldId) }
    const aiChoiceOutcome = aiChoiceFills.length
      ? (await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: applyChoiceEntries,
          args: [{ entries: aiChoiceFills, unresolvedIds: preview.unresolvedIds.filter(id => /^custom-select-/.test(id)) }],
        }))[0]?.result ?? { appliedIds: [], skippedExistingIds: [], unavailableIds: aiChoiceFills.map(entry => entry.fieldId) }
      : { appliedIds: [], skippedExistingIds: [], unavailableIds: [] }
    const outcome = {
      appliedIds: [...aiTextOutcome.appliedIds, ...aiChoiceOutcome.appliedIds],
      skippedExistingIds: [...aiTextOutcome.skippedExistingIds, ...aiChoiceOutcome.skippedExistingIds],
      unavailableIds: [...aiTextOutcome.unavailableIds, ...aiChoiceOutcome.unavailableIds],
    }
    const appliedIds = new Set(outcome.appliedIds)
    const unavailableIds = new Set(outcome.unavailableIds)
    const aiFieldIds = new Set(aiFields.map(field => field.id))
    const entries = localPlan.entries.map((entry) => {
      const { value: _value, ...safeEntry } = entry
      if (localAppliedIds.has(entry.fieldId)) return { ...safeEntry, status: 'filled' as const, reason: '已由本地个人主档案填写。' }
      if (localExistingIds.has(entry.fieldId)) return { ...safeEntry, status: 'skipped_existing' as const, reason: '字段在填写前已有内容，不会覆盖。' }
      if (localUnavailableIds.has(entry.fieldId)) return { ...safeEntry, status: 'needs_manual' as const, reason: '本地资料已匹配，但页面控件未能应用。' }
      if (!aiFieldIds.has(entry.fieldId) || entry.status === 'skipped_existing' || entry.status === 'skipped_sensitive') return safeEntry
      if (appliedIds.has(entry.fieldId)) return { ...safeEntry, status: 'filled' as const, reason: `AI 已填写（${preview.provider} / ${preview.model}）。` }
      if (unavailableIds.has(entry.fieldId)) return { ...safeEntry, status: 'needs_manual' as const, reason: 'AI 已给出建议，但页面控件未能应用。' }
      return { ...safeEntry, status: 'needs_manual' as const, reason: 'AI 未给出可用答案。' }
    })
    const report = {
      entries,
      summary: entries.reduce((summary, entry) => {
        summary[entry.status] += 1
        return summary
      }, { filled: 0, skipped_existing: 0, skipped_sensitive: 0, needs_manual: 0 }),
    }
    renderFillReport(report)
    setResult(fillResultElement, 'AI 填写已完成：浅绿色为已填写，浅红色为未能填写。请在提交前检查。')
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
    const application = await readApi<SavedApplication>('/api/v1/applications', {
      method: 'POST',
      body: JSON.stringify({
        companyName,
        jobTitle,
        location: locationInput?.value.trim() || undefined,
        salaryMin,
        salaryMax,
        jobUrl: getHttpUrl(jobUrlInput?.value.trim()),
        description: description || undefined,
        source: 'MANUAL',
        status: 'SAVED',
        channel: 'OTHER',
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

async function copyGreeting(text: string, button: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(text)
    const label = button.textContent
    button.textContent = '已复制'
    window.setTimeout(() => { button.textContent = label }, 1_500)
  }
  catch {
    setResult(greetingResultElement, '复制失败，请手动复制话术文本。', true)
  }
}

function renderGreetings(greetings: MaterialsPreview['aiDraft']['greetings']) {
  if (!greetingsElement) return
  greetingsElement.replaceChildren()

  const labels: Array<[string, Greeting]> = [
    ['短版', greetings.short],
    ['标准版', greetings.standard],
    ['技术亮点版', greetings.technicalHighlight],
  ]

  for (const [label, greeting] of labels) {
    const article = document.createElement('article')
    article.className = 'greeting'
    const heading = document.createElement('strong')
    heading.textContent = label
    const content = document.createElement('p')
    content.textContent = greeting.text
    const evidence = document.createElement('small')
    evidence.textContent = `依据：${greeting.evidence}`
    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.textContent = '复制'
    copyButton.addEventListener('click', () => void copyGreeting(greeting.text, copyButton))
    article.append(heading, content, evidence, copyButton)
    greetingsElement.append(article)
  }
}

async function generateGreetings() {
  const resumeText = resumeTextInput?.value.trim() ?? ''
  if (!savedApplicationId) {
    setResult(greetingResultElement, '请先在本窗口确认保存当前岗位，再生成话术。', true)
    return
  }
  if (!resumeText) {
    setResult(greetingResultElement, '请粘贴本次用于生成的简历文本。', true)
    return
  }

  setLoading(generateGreetingButton, true, '生成中…')
  setResult(greetingResultElement, '')
  if (greetingsElement) greetingsElement.replaceChildren()

  try {
    const preview = await readApi<MaterialsPreview>(`/api/v1/applications/${encodeURIComponent(savedApplicationId)}/materials/preview`, {
      method: 'POST',
      body: JSON.stringify({ resumeText }),
    })
    renderGreetings(preview.aiDraft.greetings)
    setResult(greetingResultElement, '已生成三版话术；它们仅供复制，不会自动发送或保存。')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '生成失败，请检查岗位 JD 和工作台连接。'
    setResult(greetingResultElement, message, true)
  }
  finally {
    setLoading(generateGreetingButton, false, '')
  }
}

for (const input of [companyNameInput, jobTitleInput, locationInput, salaryMinInput, salaryMaxInput, jobUrlInput, descriptionInput]) {
  input?.addEventListener('input', clearSavedApplication)
}

readPageButton?.addEventListener('click', () => void captureCurrentPage())
saveJobButton?.addEventListener('click', () => void saveCurrentJob())
generateGreetingButton?.addEventListener('click', () => void generateGreetings())
refreshProfilesButton?.addEventListener('click', () => void loadApplicationProfiles())
fillCurrentPageButton?.addEventListener('click', () => void fillCurrentPage())

void checkWorkbench()
void loadApplicationProfiles()
