import assert from 'node:assert/strict'
import test from 'node:test'

import { cleanCompanyClassification, extractCompanyNameAndUpdatedAt, feishuImportSchema, importedJobRowSchema, listJobsQuerySchema, referralFeishuShareUrl } from './job-library'
import { feishuOAuthCallbackSchema } from './feishu-oauth'

test('accepts the configured public Feishu Bitable link and rejects other hosts', () => {
  const shareUrl = 'https://yal2at57cvq.feishu.cn/base/GtSLbyyR3aCENOsJYC6cdlsVnih?table=tblH4au5rnBcqHgJ&view=vewMjMLWkM'
  assert.equal(feishuImportSchema.safeParse({ shareUrl }).success, true)
  assert.equal(feishuImportSchema.safeParse({ shareUrl: referralFeishuShareUrl }).success, true)
  assert.equal(feishuImportSchema.safeParse({ shareUrl: 'https://example.com/base/GtSLbyyR3aCENOsJYC6cdlsVnih' }).success, false)
})

test('extracts a trailing month-day annotation from a company name', () => {
  const extracted = extractCompanyNameAndUpdatedAt('荣耀(8.18开启)', 2026)
  assert.equal(extracted.companyName, '荣耀')
  assert.equal(extracted.sourceUpdatedAt?.getFullYear(), 2026)
  assert.equal(extracted.sourceUpdatedAt?.getMonth(), 7)
  assert.equal(extracted.sourceUpdatedAt?.getDate(), 18)
  assert.deepEqual(extractCompanyNameAndUpdatedAt('哔哩哔哩（B站）', 2026), { companyName: '哔哩哔哩（B站）', sourceUpdatedAt: null })
})

test('removes known classification pollution without discarding valid categories', () => {
  assert.equal(cleanCompanyClassification('婉清学姐冲冲冲的店唯一正版'), null)
  assert.equal(cleanCompanyClassification('科技、婉清学姐冲冲冲的店唯一正版'), '科技')
})

test('requires source company and job title while preserving job guidance fields', () => {
  const valid = { companyName: '示例公司', companyDescription: '专注企业服务。', title: '前端工程师', announcementUrl: null, url: null, referralCode: 'JOIN2027', applicationNotes: '投递后填写问卷。', hasWrittenTest: null }
  assert.equal(importedJobRowSchema.safeParse(valid).success, true)
  assert.equal(importedJobRowSchema.parse(valid).referralCode, 'JOIN2027')
  assert.equal(importedJobRowSchema.safeParse({ ...valid, title: '岗位、'.repeat(500) }).success, true)
  assert.equal(importedJobRowSchema.parse({ ...valid, announcementUrl: '点击查看', url: '/' }).announcementUrl, null)
  assert.equal(importedJobRowSchema.safeParse({ ...valid, companyName: ' ' }).success, false)
  assert.equal(importedJobRowSchema.safeParse({ ...valid, title: ' ' }).success, false)
})

test('defaults hidden offline jobs and valid pagination', () => {
  const parsed = listJobsQuerySchema.parse({})
  assert.equal(parsed.page, 1)
  assert.equal(parsed.pageSize, 20)
  assert.equal(parsed.includeOffline, false)
  assert.equal(parsed.updatedSort, 'desc')
})

test('requires a bounded OAuth callback code and signed-state parameter', () => {
  assert.equal(feishuOAuthCallbackSchema.safeParse({ code: 'one-time-code', state: 'signed-state' }).success, true)
  assert.equal(feishuOAuthCallbackSchema.safeParse({ code: 'one-time-code' }).success, false)
  assert.equal(feishuOAuthCallbackSchema.safeParse({ code: '', state: 'signed-state' }).success, false)
})
