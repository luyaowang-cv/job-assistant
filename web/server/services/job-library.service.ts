import { ApplicationChannel, ApplicationEventType, ApplicationStatus, JobSource, type Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import { importedJobRowSchema, type FeishuImportInput, type ImportedJobRow, type ListJobsQuery } from '../schemas/job-library'

import { getLocalUser } from './local-user'
import { getFeishuUserAccessToken } from './feishu-oauth.service'

const fieldAliases = {
  companyName: ['公司名称', '公司', 'company name'],
  title: ['招聘岗位', '岗位名称', '岗位', 'job title'],
  location: ['工作地点', '地点', 'location'],
  industry: ['行业分类', '行业', 'industry'],
  companyType: ['企业性质', '公司性质', 'company type'],
  recruitmentType: ['批次', '招聘批次', 'recruitment type'],
  announcementUrl: ['公告链接', '公告', 'announcement url'],
  url: ['投递链接', '申请链接', '岗位链接', 'application url'],
  sourceUpdatedAt: ['更新时间', '更新日期', 'updated at'],
  hasWrittenTest: ['是否笔试', '笔试', 'written test'],
  deadlineAt: ['截止时间', '截止日期', 'deadline'],
} as const

type FeishuValue = string | number | boolean | Array<unknown> | Record<string, unknown> | null | undefined
type FeishuRecord = { record_id: string, fields: Record<string, FeishuValue> }
type FeishuTable = { table_id: string, name: string }

export class JobLibraryImportError extends Error {
  constructor(message: string, readonly code: 'FEISHU_NOT_CONFIGURED' | 'FEISHU_READ_FAILED' | 'FEISHU_INVALID_DATA' | 'EXCEL_READ_FAILED' | 'EXCEL_INVALID_DATA') {
    super(message)
  }
}

function textValue(value: FeishuValue): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim() || null
  if (Array.isArray(value)) return value.map(item => textValue(item as FeishuValue)).filter((item): item is string => Boolean(item)).join(', ') || null
  for (const key of ['text', 'name', 'url', 'link']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

function linkValue(value: FeishuValue): string | null {
  if (Array.isArray(value)) return linkValue(value[0] as FeishuValue)
  if (value && typeof value === 'object') {
    for (const key of ['link', 'url', 'text']) {
      const candidate = value[key]
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
  }
  return textValue(value)
}

function dateValue(value: FeishuValue): Date | null {
  const raw = textValue(value)
  if (!raw) return null
  const timestamp = Number(raw)
  const date = Number.isFinite(timestamp) && /^\d{10,13}$/.test(raw)
    ? new Date(raw.length === 10 ? timestamp * 1_000 : timestamp)
    : new Date(raw)
  return Number.isNaN(date.valueOf()) ? null : date
}

function booleanValue(value: FeishuValue): boolean | null {
  const raw = textValue(value)?.toLowerCase()
  if (!raw) return null
  if (['是', '有', 'true', 'yes', '1', '需要'].includes(raw)) return true
  if (['否', '无', 'false', 'no', '0', '不需要'].includes(raw)) return false
  return null
}

function fieldValue(fields: Record<string, FeishuValue>, aliases: readonly string[]) {
  const entry = Object.entries(fields).find(([name]) => aliases.includes(name.replace(/\s/g, '').toLowerCase() as never))
  return entry?.[1]
}

export function mapFeishuRecord(record: FeishuRecord): ImportedJobRow | null {
  const fields = record.fields
  const companyName = textValue(fieldValue(fields, fieldAliases.companyName))
  const title = textValue(fieldValue(fields, fieldAliases.title))
  // The source Bitable contains child/link records with a company but no job title.
  // They are structural rows rather than job postings and must not abort a full sync.
  if (!companyName || !title) return null
  const parsed = importedJobRowSchema.safeParse({
    companyName,
    title,
    location: textValue(fieldValue(fields, fieldAliases.location)),
    industry: textValue(fieldValue(fields, fieldAliases.industry)),
    companyType: textValue(fieldValue(fields, fieldAliases.companyType)),
    recruitmentType: textValue(fieldValue(fields, fieldAliases.recruitmentType)),
    announcementUrl: linkValue(fieldValue(fields, fieldAliases.announcementUrl)),
    url: linkValue(fieldValue(fields, fieldAliases.url)),
    sourceUpdatedAt: dateValue(fieldValue(fields, fieldAliases.sourceUpdatedAt)),
    hasWrittenTest: booleanValue(fieldValue(fields, fieldAliases.hasWrittenTest)),
    deadlineAt: dateValue(fieldValue(fields, fieldAliases.deadlineAt)),
  })

  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join('.') || '记录'}：${issue.message}`).join('；')
    throw new JobLibraryImportError(`飞书记录 ${record.record_id} 无法导入。${issues}`, 'FEISHU_INVALID_DATA')
  }
  return parsed.data
}

function parseShareUrl(shareUrl: string) {
  const url = new URL(shareUrl)
  const parts = url.pathname.split('/').filter(Boolean)
  const baseIndex = parts.indexOf('base')
  const appToken = (baseIndex >= 0 ? parts[baseIndex + 1] : undefined) ?? parts.find(part => /^app[a-zA-Z0-9]+$/.test(part))
  const tableId = url.searchParams.get('table') ?? parts.find(part => /^tbl[a-zA-Z0-9]+$/.test(part))
  if (!appToken) throw new JobLibraryImportError('无法从分享链接识别飞书多维表格。请粘贴包含 base 的公开表格链接。', 'FEISHU_READ_FAILED')
  return { appToken, tableId }
}

async function feishuRequest<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await response.json() as { code?: number, msg?: string, data?: T }
  if (!response.ok || body.code !== 0 || !body.data) {
    throw new JobLibraryImportError(`读取飞书表格失败：${body.msg ?? response.statusText}`, 'FEISHU_READ_FAILED')
  }
  return body.data
}

const FEISHU_SESSION_VALUES = ['2027届', '2027']
const FEISHU_BATCH_VALUES = ['秋招专场', '秋招提前批']
const sessionFieldAliases = ['届次', '届', 'session', '年份'] as const

// 飞书同步前按「届次 + 批次」过滤，只保留 2027 届秋招专场/提前批。
// 届次只用于过滤、不落库（过滤后入库的岗位都已是 2027 届）。
function matchesFeishuFilter(fields: Record<string, FeishuValue>): boolean {
  const session = textValue(fieldValue(fields, sessionFieldAliases))
  const batch = textValue(fieldValue(fields, fieldAliases.recruitmentType))
  const sessionOk = session ? FEISHU_SESSION_VALUES.some(value => session.includes(value)) : false
  const batchOk = batch ? FEISHU_BATCH_VALUES.some(value => batch.includes(value)) : false
  return sessionOk && batchOk
}

async function readFeishuRecords(appToken: string, tableId: string, accessToken: string) {
  const records: FeishuRecord[] = []
  let pageToken: string | undefined
  do {
    const query = new URLSearchParams({ page_size: '500' })
    if (pageToken) query.set('page_token', pageToken)
    const page = await feishuRequest<{ items: FeishuRecord[], has_more?: boolean, page_token?: string }>(`/bitable/v1/apps/${appToken}/tables/${tableId}/records?${query}`, accessToken)
    records.push(...page.items)
    pageToken = page.has_more ? page.page_token : undefined
  } while (pageToken)
  const filtered = records.filter(record => matchesFeishuFilter(record.fields))
  const mappedRows = filtered.map(mapFeishuRecord)
  const rows = mappedRows.filter((row): row is ImportedJobRow => row !== null)
  return { sourceDocId: `${appToken}:${tableId}`, rows, skipped: records.length - rows.length }
}

async function importRows(sourceDocId: string, rows: ImportedJobRow[], skipped: number) {
  const syncedAt = new Date()
  const rowsByKey = new Map<string, ImportedJobRow>()
  for (const row of rows) rowsByKey.set(`${row.companyName}\u0000${row.title}`, row)
  const uniqueRows = [...rowsByKey.values()]
  const companyNames = [...new Set(uniqueRows.map(row => row.companyName))]
  const existingCompanies = await prisma.company.findMany({ where: { name: { in: companyNames } }, select: { id: true, name: true } })
  const companyIds = new Map(existingCompanies.map(company => [company.name, company.id]))
  const missingCompanies = uniqueRows.filter(row => !companyIds.has(row.companyName))
  if (missingCompanies.length) {
    const firstByCompany = new Map<string, ImportedJobRow>()
    for (const row of missingCompanies) firstByCompany.set(row.companyName, row)
    await prisma.company.createMany({ data: [...firstByCompany.values()].map(row => ({ name: row.companyName, industry: row.industry, companyType: row.companyType })), skipDuplicates: true })
    const createdCompanies = await prisma.company.findMany({ where: { name: { in: [...firstByCompany.keys()] } }, select: { id: true, name: true } })
    for (const company of createdCompanies) companyIds.set(company.name, company.id)
  }

  const existingJobs = await prisma.job.findMany({ where: { sourceDocId }, select: { id: true, companyId: true, title: true } })
  const existingJobIds = new Map(existingJobs.map(job => [`${job.companyId}\u0000${job.title}`, job.id]))
  const toCreate: Array<{ companyId: string, title: string, source: JobSource, sourceDocId: string, location: string | null, recruitmentType: string | null, announcementUrl: string | null, url: string | null, hasWrittenTest: boolean | null, sourceUpdatedAt: Date | null, deadlineAt: Date | null, syncedAt: Date, offlineAt: null }> = []
  const updates = []
  const seenExistingJobIds: string[] = []
  for (const row of uniqueRows) {
    const companyId = companyIds.get(row.companyName)
    if (!companyId) throw new JobLibraryImportError(`公司「${row.companyName}」写入后无法读取。`, 'FEISHU_READ_FAILED')
    const data = { location: row.location, recruitmentType: row.recruitmentType, announcementUrl: row.announcementUrl, url: row.url, hasWrittenTest: row.hasWrittenTest, sourceUpdatedAt: row.sourceUpdatedAt, deadlineAt: row.deadlineAt, syncedAt, offlineAt: null }
    const existingId = existingJobIds.get(`${companyId}\u0000${row.title}`)
    if (existingId) {
      seenExistingJobIds.push(existingId)
      updates.push(prisma.job.update({ where: { id: existingId }, data }))
    }
    else toCreate.push({ companyId, title: row.title, source: JobSource.OTHER, sourceDocId, ...data })
  }

  if (updates.length) await prisma.$transaction(updates, { maxWait: 15_000, timeout: 180_000 })
  const offlined = await prisma.job.updateMany({ where: { sourceDocId, offlineAt: null, ...(seenExistingJobIds.length ? { id: { notIn: seenExistingJobIds } } : {}) }, data: { offlineAt: syncedAt } })
  if (toCreate.length) await prisma.job.createMany({ data: toCreate })
  return { created: toCreate.length, updated: updates.length, offlined: offlined.count, skipped, total: uniqueRows.length }
}

export async function importFeishuJobs(input: FeishuImportInput) {
  const { appToken, tableId: tableIdFromUrl } = parseShareUrl(input.shareUrl)
  if (!tableIdFromUrl) throw new JobLibraryImportError('请使用已打开「27届秋招」数据表后复制的飞书链接。链接中需要包含 table=tbl... 参数。', 'FEISHU_READ_FAILED')
  const accessToken = await getFeishuUserAccessToken()
  const tables = await feishuRequest<{ items: FeishuTable[] }>(`/bitable/v1/apps/${appToken}/tables`, accessToken)
  const targetTable = tables.items.find(table => table.table_id === tableIdFromUrl)
  if (!targetTable) throw new JobLibraryImportError('链接指定的数据表不存在或当前账号无权读取。请重新从「27届秋招」标签页复制链接。', 'FEISHU_READ_FAILED')
  const { sourceDocId, rows, skipped } = await readFeishuRecords(appToken, targetTable.table_id, accessToken)
  return importRows(sourceDocId, rows, skipped)
}

const excelColumnMap = {
  companyName: '公司名称',
  title: '职位',
  location: '地点',
  industry: '行业',
  companyType: '标签',
  recruitmentType: '批次',
  announcementUrl: '公告链接',
  url: '投递链接',
} as const

// SheetJS 会把单元格解析成基础类型（字符串/数字/布尔/日期），这里统一转成文本。
function xlsxCellText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim() || null
  if (value instanceof Date) return value.toISOString()
  return null
}

export async function importExcelJobs(buffer: Buffer, filename: string) {
  // 动态 import，避免 Nitro 打包 xlsx 时把内部 cpexcel.js 解析成 Windows 绝对路径（同 playwright-core 的处理方式）。
  const xlsxModule = 'xlsx'
  const XLSX = await import(/* @vite-ignore */ xlsxModule) as typeof import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.SheetNames[0] ? workbook.Sheets[workbook.SheetNames[0]] : undefined
  if (!sheet) throw new JobLibraryImportError('Excel 文件没有可读取的工作表。', 'EXCEL_INVALID_DATA')

  // header: 1 表示按「二维数组」返回，第一行是表头，后续是数据行。
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false }) as unknown[][]
  const header = new Map<number, string>()
  ;(rawRows[0] ?? []).forEach((cell, colIndex) => {
    const name = xlsxCellText(cell)
    if (name) header.set(colIndex, name)
  })

  const rows: ImportedJobRow[] = []
  let skipped = 0
  const writtenTestAliases = ['是否笔试', '笔试', '有无笔试', 'written test', '笔试环节']
  const normalizedHeader = (name: string) => name.replace(/\\s/g, '').toLowerCase()
  const writtenTestCol = [...header.entries()].find(([, name]) => writtenTestAliases.some(alias => normalizedHeader(name) === normalizedHeader(alias)))?.[0]
  for (let i = 1; i < rawRows.length; i++) {
    const raw: Record<string, string | null> = {}
    for (const [colIndex, name] of header) raw[name] = xlsxCellText(rawRows[i]?.[colIndex])
    const companyName = raw[excelColumnMap.companyName]
    const title = raw[excelColumnMap.title]
    if (!companyName || !title) { skipped += 1; continue }
    const parsed = importedJobRowSchema.safeParse({
      companyName,
      title,
      location: raw[excelColumnMap.location],
      industry: raw[excelColumnMap.industry],
      companyType: raw[excelColumnMap.companyType],
      recruitmentType: raw[excelColumnMap.recruitmentType],
      announcementUrl: raw[excelColumnMap.announcementUrl],
      url: raw[excelColumnMap.url],
      hasWrittenTest: writtenTestCol === undefined ? null : booleanValue(rawRows[i]?.[writtenTestCol] as FeishuValue),
    })
    if (!parsed.success) { skipped += 1; continue }
    rows.push(parsed.data)
  }

  return importRows(`excel:${filename}`, rows, skipped)
}

export async function clearJobs() {
  return prisma.$transaction(async (tx) => {
    const materials = await tx.applicationMaterial.deleteMany()
    const runs = await tx.agentRun.deleteMany()
    const events = await tx.applicationEvent.deleteMany()
    const applications = await tx.application.deleteMany()
    const jobs = await tx.job.deleteMany()
    const companies = await tx.company.deleteMany()
    return {
      materials: materials.count,
      agentRuns: runs.count,
      events: events.count,
      applications: applications.count,
      jobs: jobs.count,
      companies: companies.count,
    }
  })
}

export async function listJobs(query: ListJobsQuery) {
  const user = await getLocalUser()
  const where: Prisma.JobWhereInput = {
    ...(query.includeOffline ? {} : { offlineAt: null }),
    ...(query.location ? { location: { contains: query.location, mode: 'insensitive' } } : {}),
    ...(query.recruitmentType ? { recruitmentType: { contains: query.recruitmentType, mode: 'insensitive' } } : {}),
    ...(query.hasWrittenTest === undefined ? {} : { hasWrittenTest: query.hasWrittenTest }),
    ...(query.industry || query.companyType ? { company: { ...(query.industry ? { industry: { contains: query.industry, mode: 'insensitive' } } : {}), ...(query.companyType ? { companyType: { contains: query.companyType, mode: 'insensitive' } } : {}) } } : {}),
    ...(query.search ? { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { company: { name: { contains: query.search, mode: 'insensitive' } } }] } : {}),
  }
  const [items, total, filterRows] = await prisma.$transaction([
    prisma.job.findMany({ where, include: { company: true, applications: { where: { userId: user.id, deletedAt: null }, select: { id: true } } }, orderBy: [{ offlineAt: 'asc' }, { sourceUpdatedAt: 'desc' }, { updatedAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.job.count({ where }),
    prisma.job.findMany({ where: { offlineAt: null }, select: { location: true, recruitmentType: true, company: { select: { industry: true, companyType: true } } } }),
  ])
  const values = (items: Array<string | null>) => [...new Set(items.filter((value): value is string => Boolean(value)))].sort()
  const splitTokens = (value: string) => value.split(/[,、，;；/]+/).map(item => item.trim()).filter(Boolean)
  const uniqueTokens = (items: Array<string | null>, dropJunk = false) => {
    const set = new Set<string>()
    for (const value of items) {
      if (!value) continue
      for (const token of splitTokens(value)) {
        if (dropJunk && token === '-') continue
        set.add(token)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }
  return { items: items.map(({ applications, ...job }) => ({ ...job, applicationId: applications[0]?.id ?? null })), page: query.page, pageSize: query.pageSize, total, filters: { locations: uniqueTokens(filterRows.map(row => row.location)), industries: uniqueTokens(filterRows.map(row => row.company.industry), true), companyTypes: values(filterRows.map(row => row.company.companyType)).filter(value => value !== '-'), recruitmentTypes: uniqueTokens(filterRows.map(row => row.recruitmentType)) } }
}

export async function createApplicationFromJob(jobId: string) {
  const user = await getLocalUser()
  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (!job) return null
  const existing = await prisma.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId } }, include: { job: { include: { company: true } } } })
  if (existing) return { application: existing, created: false }

  try {
    const application = await prisma.$transaction(async (transaction) => {
      const created = await transaction.application.create({ data: { userId: user.id, jobId, status: ApplicationStatus.SAVED, channel: ApplicationChannel.OTHER }, include: { job: { include: { company: true } } } })
      await transaction.applicationEvent.create({ data: { applicationId: created.id, type: ApplicationEventType.CREATE, payload: { source: 'JOB_LIBRARY', status: ApplicationStatus.SAVED, channel: ApplicationChannel.OTHER } } })
      return created
    })
    return { application, created: true }
  }
  catch {
    const concurrent = await prisma.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId } }, include: { job: { include: { company: true } } } })
    if (concurrent) return { application: concurrent, created: false }
    throw new Error('Unable to create application from job.')
  }
}
